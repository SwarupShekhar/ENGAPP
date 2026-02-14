import time
import json
import asyncio
import base64
import azure.cognitiveservices.speech as speechsdk
from typing import List, Optional, Any

from app.core.config import settings
from app.core.logging import logger
from app.models.base import Word
from app.models.request import TranscriptionRequest
from app.models.response import TranscriptionResponse
from app.cache.manager import cached
from app.utils.audio_utils import validate_audio_url, download_audio_streamed

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

        def on_recognized(evt):
            nonlocal total_duration
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                full_text.append(evt.result.text)
                words = self._extract_words_from_result(evt.result)
                # Adjust timestamps based on total duration so far
                for word in words:
                    word.start_time += total_duration
                    word.end_time += total_duration
                all_words.extend(words)
                total_duration += evt.result.duration.total_seconds()
            elif evt.result.reason == speechsdk.ResultReason.NoMatch:
                logger.debug("No speech could be recognized.")
            elif evt.result.reason == speechsdk.ResultReason.Canceled:
                cancellation_details = evt.result.cancellation_details
                logger.error(f"Speech Recognition canceled: {cancellation_details.reason}")
                if cancellation_details.reason == speechsdk.CancellationReason.Error:
                    recognized_future.set_exception(RuntimeError(f"Azure Error: {cancellation_details.error_details}"))


        def on_session_stopped(evt):
            logger.debug("Session stopped.")
            if not recognized_future.done():
                recognized_future.set_result(True)

        recognizer.recognized.connect(on_recognized)
        recognizer.session_stopped.connect(on_session_stopped)
        recognizer.canceled.connect(on_session_stopped)
        
        recognizer.start_continuous_recognition()

        try:
            if has_base64:
                try:
                    # Robust handling: Convert to PCM 16kHz via pydub
                    import io
                    from pydub import AudioSegment
                    
                    audio_bytes = base64.b64decode(request.audio_base64)
                    
                    # Convert to AudioSegment
                    audio_segment = AudioSegment.from_file(io.BytesIO(audio_bytes))
                    
                    # Normalize to 16kHz mono (Azure Default)
                    audio_segment = audio_segment.set_frame_rate(16000).set_channels(1).set_sample_width(2)
                    
                    # Get raw PCM data (no WAV header)
                    chunk_size = 4096
                    raw_data = audio_segment.raw_data
                    
                    # Write in chunks
                    for i in range(0, len(raw_data), chunk_size):
                        push_stream.write(raw_data[i:i+chunk_size])
                        
                    logger.info(f"Streamed {len(raw_data)} bytes of PCM audio for transcription")
                    
                except Exception as e:
                    logger.error(f"Audio conversion failed in transcription: {e}")
                    # Fallback to raw bytes (might be M4A/WAV) - Azure might reject
                    audio_bytes = base64.b64decode(request.audio_base64)
                    push_stream.write(audio_bytes)
            else:
                # Stream from URL
                from app.utils.audio_utils import stream_audio_content
                async for chunk in stream_audio_content(str(request.audio_url)):
                    if chunk:
                        push_stream.write(chunk)
                    else:
                        break
        finally:
            push_stream.close()

        await recognized_future
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
