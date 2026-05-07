import os
import time
import json
import asyncio
import base64
import io
import wave
import azure.cognitiveservices.speech as speechsdk
from typing import List, Optional, Any

from app.core.config import settings
from app.core.logger import logger
from app.models.base import Word
from app.models.request import TranscriptionRequest
from app.models.response import TranscriptionResponse
from app.cache.manager import cached
from app.features.transcription.audio_utils import validate_audio_url
from app.features.transcription.deepgram_service import deepgram_transcription_service

class TranscriptionService:
    """
    Transcription Service using Azure Speech SDK.
    """
    
    def __init__(self):
        self.speech_config = None
        if settings.azure_speech_key and settings.azure_speech_region:
            self.speech_config = speechsdk.SpeechConfig(
                subscription=settings.azure_speech_key,
                region=settings.azure_speech_region
            )
            self.speech_config.request_word_level_timestamps()
            self.speech_config.output_format = speechsdk.OutputFormat.Detailed
            self.speech_config.set_property(
                speechsdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "5000"
            )
        else:
            logger.warning("Azure Speech credentials not configured.")

    @staticmethod
    def _pcm16le_mono_to_wav(pcm: bytes, sample_rate: int = 16000) -> bytes:
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(pcm)
        return buf.getvalue()

    async def _optional_deepgram_secondary(
        self,
        pcm_audio: bytes,
        language: str | None,
    ) -> tuple[str | None, float | None]:
        if not (
            settings.deepgram_secondary_transcript
            and deepgram_transcription_service.configured
        ):
            return None, None
        wav_bytes = self._pcm16le_mono_to_wav(pcm_audio)
        try:
            dg = await deepgram_transcription_service.transcribe_bytes(
                wav_bytes,
                language=language or settings.deepgram_language,
                mime_type="audio/wav",
            )
            t = dg.text.strip() if dg.text else ""
            return (t or None), dg.confidence
        except Exception as dg_err:
            logger.warning(
                "Deepgram secondary transcription failed (non-fatal)",
                error=str(dg_err),
                exc_info=True,
            )
            return None, None

    async def _transcribe_pcm_azure_parallel(
        self,
        pcm_audio: bytes,
        language: str,
        start_time: float,
        secondary_task: asyncio.Task | None,
    ) -> TranscriptionResponse:
        if not self.speech_config:
            raise RuntimeError("Transcription service is not configured.")

        push_stream = speechsdk.audio.PushAudioInputStream()
        audio_config = speechsdk.audio.AudioConfig(stream=push_stream)
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config,
            audio_config=audio_config,
            language=language,
        )

        full_text: list[str] = []
        all_words: List[Word] = []
        total_duration = 0.0

        recognized_future: asyncio.Future = asyncio.Future()
        loop = asyncio.get_event_loop()

        def on_recognized(evt):
            def _update_state():
                nonlocal total_duration
                try:
                    if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                        full_text.append(evt.result.text)
                        words = self._extract_words_from_result(evt.result)
                        for word in words:
                            word.start_time += total_duration
                            word.end_time += total_duration
                        all_words.extend(words)
                        dur = evt.result.duration
                        if hasattr(dur, "total_seconds"):
                            total_duration += dur.total_seconds()
                        elif isinstance(dur, (int, float)):
                            total_duration += dur / 1e7
                        else:
                            total_duration += 0.0
                    elif evt.result.reason == speechsdk.ResultReason.NoMatch:
                        logger.debug("No speech could be recognized.")
                    elif evt.result.reason == speechsdk.ResultReason.Canceled:
                        cancellation_details = evt.result.cancellation_details
                        logger.error(
                            f"Speech Recognition canceled: {cancellation_details.reason}"
                        )
                        if cancellation_details.reason == speechsdk.CancellationReason.Error:
                            if not recognized_future.done():
                                recognized_future.set_exception(
                                    RuntimeError(
                                        f"Azure Error: {cancellation_details.error_details}"
                                    )
                                )
                except Exception as cb_err:
                    logger.error(f"_update_state callback error: {cb_err}", exc_info=True)

            loop.call_soon_threadsafe(_update_state)

        def on_session_stopped(evt):
            def _set_result():
                logger.debug("Session stopped.")
                if not recognized_future.done():
                    recognized_future.set_result(True)

            loop.call_soon_threadsafe(_set_result)

        recognizer.recognized.connect(on_recognized)
        recognizer.session_stopped.connect(on_session_stopped)
        recognizer.canceled.connect(on_session_stopped)

        recognizer.start_continuous_recognition()

        chunk_size = 4096
        try:
            for i in range(0, len(pcm_audio), chunk_size):
                push_stream.write(pcm_audio[i : i + chunk_size])
            logger.info(f"Streamed {len(pcm_audio)} bytes of PCM audio for transcription")
        finally:
            push_stream.close()

        try:
            if secondary_task:
                await asyncio.gather(recognized_future, secondary_task)
            else:
                await recognized_future
        finally:
            recognizer.stop_continuous_recognition()

        confidence = (
            sum(w.confidence for w in all_words) / len(all_words) if all_words else 0.0
        )

        sec_text = None
        sec_conf = None
        if secondary_task:
            if secondary_task.done() and not secondary_task.cancelled():
                try:
                    sec_text, sec_conf = secondary_task.result()
                except Exception:
                    sec_text, sec_conf = None, None

        return TranscriptionResponse(
            text=" ".join(full_text).strip(),
            confidence=confidence,
            words=all_words,
            duration=total_duration,
            processing_time=time.time() - start_time,
            secondary_text=sec_text,
            secondary_provider="deepgram" if sec_text else None,
            secondary_confidence=sec_conf if sec_text else None,
        )

    def _extract_words_from_result(self, result: speechsdk.SpeechRecognitionResult) -> List[Word]:
        """Extract word timings from detailed JSON result."""
        if not result.json:
            return []
        
        detailed_result = json.loads(result.json)
        if 'NBest' not in detailed_result or not detailed_result['NBest']:
            return []
            
        nbest = detailed_result['NBest'][0]
        words = []
        for word_info in nbest.get('Words', []):
            words.append(Word(
                text=word_info.get('Word', ''),
                start_time=word_info.get('Offset', 0) / 1e7,
                end_time=(word_info.get('Offset', 0) + word_info.get('Duration', 0)) / 1e7,
                confidence=word_info.get('Confidence', 0.0)
            ))
        return words

    @cached(prefix="transcription", ttl=settings.cache_ttl_transcription)
    async def transcribe(self, request: TranscriptionRequest) -> TranscriptionResponse:
        """
        Azure Speech is the pronunciation-aligned primary transcript (`text`).
        Deepgram Nova-3 is optional as `secondary_text` when `DEEPGRAM_SECONDARY_TRANSCRIPT`
        is enabled and credentials are present.
        """
        start_time = time.time()

        has_base64 = bool(request.audio_base64)
        has_url = bool(request.audio_url)

        if not has_base64 and not has_url:
            raise ValueError("Either audio_url or audio_base64 must be provided")

        if has_base64:
            if not request.audio_base64 or len(request.audio_base64) < 100:
                logger.info("Empty or too small audio base64, returning empty transcript")
                return TranscriptionResponse(
                    text="",
                    confidence=0.0,
                    words=[],
                    duration=0.0,
                    processing_time=time.time() - start_time,
                )

        if has_url and not has_base64:
            is_valid, error = await validate_audio_url(str(request.audio_url))
            if not is_valid:
                raise ValueError(error)

        from pydub import AudioSegment

        if has_base64:
            audio_bytes = base64.b64decode(request.audio_base64)
            audio_segment = AudioSegment.from_file(io.BytesIO(audio_bytes))
        else:
            import httpx

            audio_url = str(request.audio_url)
            async with httpx.AsyncClient() as client:
                resp = await client.get(audio_url)
                resp.raise_for_status()
                audio_data = resp.content
            logger.info(f"Downloaded audio from URL: {len(audio_data)} bytes")
            audio_segment = await asyncio.to_thread(
                AudioSegment.from_file, io.BytesIO(audio_data)
            )

        audio_segment = audio_segment.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        pcm_audio = audio_segment.raw_data

        deepgram_only = (
            not self.speech_config
            and deepgram_transcription_service.configured
            and settings.transcription_model.lower() == "deepgram"
        )
        if deepgram_only:
            wav_bytes = self._pcm16le_mono_to_wav(pcm_audio)
            dg = await deepgram_transcription_service.transcribe_bytes(
                wav_bytes,
                language=request.language,
                mime_type="audio/wav",
            )
            return TranscriptionResponse(
                text=dg.text,
                confidence=dg.confidence,
                words=dg.words,
                duration=dg.duration,
                processing_time=time.time() - start_time,
                secondary_text=None,
                secondary_provider=None,
                secondary_confidence=None,
            )

        if not self.speech_config:
            raise RuntimeError("Transcription service is not configured.")

        secondary_task: asyncio.Task | None = None
        if settings.deepgram_secondary_transcript and deepgram_transcription_service.configured:
            secondary_task = asyncio.create_task(
                self._optional_deepgram_secondary(pcm_audio, request.language)
            )

        return await self._transcribe_pcm_azure_parallel(
            pcm_audio,
            request.language,
            start_time,
            secondary_task,
        )
    
    async def transcribe_with_diarization(self, request: TranscriptionRequest) -> TranscriptionResponse:
        # Placeholder for future implementation of speaker diarization
        logger.warning("Diarization is not yet implemented.")
        return await self.transcribe(request)


transcription_service = TranscriptionService()
