import os
import time
import json
import asyncio
import base64
import azure.cognitiveservices.speech as speechsdk
from typing import List, Optional, Any

from app.core.config import settings
from app.core.logger import logger
from app.models.base import Word
from app.models.request import TranscriptionRequest
from app.models.response import TranscriptionResponse
from app.cache.manager import cached
from app.features.transcription.audio_utils import validate_audio_url

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
        Transcribes audio from a given URL using Azure Speech SDK.
        This implementation uses a push stream to handle audio data, which is memory-efficient.
        """
        if not self.speech_config:
            raise RuntimeError("Transcription service is not configured.")

        start_time = time.time()
        
        # Determine audio source: base64 or URL
        has_base64 = bool(request.audio_base64)
        has_url = bool(request.audio_url)
        
        if not has_base64 and not has_url:
            raise ValueError("Either audio_url or audio_base64 must be provided")
        
        if has_url and not has_base64:
            is_valid, error = await validate_audio_url(str(request.audio_url))
            if not is_valid:
                raise ValueError(error)

        push_stream = speechsdk.audio.PushAudioInputStream()
        audio_config = speechsdk.audio.AudioConfig(stream=push_stream)
        recognizer = speechsdk.SpeechRecognizer(speech_config=self.speech_config, audio_config=audio_config, language=request.language)

        full_text = []
        all_words = []
        total_duration = 0
        
        recognized_future = asyncio.Future()
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
                        if hasattr(dur, 'total_seconds'):
                            total_duration += dur.total_seconds()
                        elif isinstance(dur, (int, float)):
                            total_duration += dur / 1e7
                        else:
                            total_duration += 0
                    elif evt.result.reason == speechsdk.ResultReason.NoMatch:
                        logger.debug("No speech could be recognized.")
                    elif evt.result.reason == speechsdk.ResultReason.Canceled:
                        cancellation_details = evt.result.cancellation_details
                        logger.error(f"Speech Recognition canceled: {cancellation_details.reason}")
                        if cancellation_details.reason == speechsdk.CancellationReason.Error:
                            if not recognized_future.done():
                                recognized_future.set_exception(
                                    RuntimeError(f"Azure Error: {cancellation_details.error_details}")
                                )
                except Exception as cb_err:
                    logger.error(f"_update_state callback error: {cb_err}", exc_info=True)
            # Schedule update on asyncio event loop thread-safely
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

        try:
            import io
            from pydub import AudioSegment

            if has_base64:
                if not request.audio_base64 or len(request.audio_base64) < 100:
                    logger.info("Empty or too small audio base64, returning empty transcript")
                    return TranscriptionResponse(text="", confidence=0.0, words=[], duration=0.0, processing_time=time.time() - start_time)
                
                try:
                    audio_bytes = base64.b64decode(request.audio_base64)
                    audio_segment = AudioSegment.from_file(io.BytesIO(audio_bytes))
                    audio_segment = audio_segment.set_frame_rate(16000).set_channels(1).set_sample_width(2)
                    raw_data = audio_segment.raw_data
                    
                    chunk_size = 4096
                    for i in range(0, len(raw_data), chunk_size):
                        push_stream.write(raw_data[i:i+chunk_size])
                        
                    logger.info(f"Streamed {len(raw_data)} bytes of PCM audio for transcription (base64)")
                    
                except Exception as e:
                    logger.error("Audio conversion failed in transcription", exc_info=True)
                    push_stream.close()
                    raise RuntimeError(f"Audio conversion to PCM failed: {e}")
            else:
                import tempfile
                from app.features.transcription.audio_utils import download_audio_streamed
                
                audio_url = str(request.audio_url)
                ext = os.path.splitext(audio_url.split("?")[0])[-1] or ".mp4"
                fd, tmp_path = tempfile.mkstemp(suffix=ext)
                os.close(fd)
                try:
                    await download_audio_streamed(audio_url, tmp_path)
                    file_size = os.path.getsize(tmp_path)
                    logger.info(f"Downloaded audio from URL: {file_size} bytes, ext={ext}")

                    audio_segment = await asyncio.to_thread(
                        AudioSegment.from_file, tmp_path
                    )
                    audio_segment = audio_segment.set_frame_rate(16000).set_channels(1).set_sample_width(2)
                    raw_data = audio_segment.raw_data

                    chunk_size = 4096
                    for i in range(0, len(raw_data), chunk_size):
                        push_stream.write(raw_data[i:i+chunk_size])

                    logger.info(f"Streamed {len(raw_data)} bytes of PCM audio for transcription (URL, converted from {ext})")
                except Exception as e:
                    logger.error(f"URL audio download/conversion failed: {e}", exc_info=True)
                    push_stream.close()
                    raise RuntimeError(f"Audio download/conversion from URL failed: {e}")
                finally:
                    try:
                        os.unlink(tmp_path)
                    except OSError:
                        pass
        finally:
            push_stream.close()

        try:
            await recognized_future
        finally:
            recognizer.stop_continuous_recognition()
        
        # Calculate overall confidence
        confidence = sum(w.confidence for w in all_words) / len(all_words) if all_words else 0.0

        return TranscriptionResponse(
            text=" ".join(full_text),
            confidence=confidence,
            words=all_words,
            duration=total_duration,
            processing_time=time.time() - start_time
        )
    
    async def transcribe_with_diarization(self, request: TranscriptionRequest) -> TranscriptionResponse:
        # Placeholder for future implementation of speaker diarization
        logger.warning("Diarization is not yet implemented.")
        return await self.transcribe(request)


transcription_service = TranscriptionService()
