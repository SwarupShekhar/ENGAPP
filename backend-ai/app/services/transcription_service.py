import os
import time
import json
import asyncio
import tempfile
from typing import List, Optional, Any
import azure.cognitiveservices.speech as speechsdk
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings
from app.core.logging import logger
from app.models.base import Word
from app.models.request import TranscriptionRequest
from app.models.response import TranscriptionResponse
from app.cache.manager import cached
from app.utils.audio_utils import validate_audio_url, download_audio_streamed

class TranscriptionService:
    """
    Robust Transcription Service using Azure Speech SDK.
    Features: 
    - Word-level timestamps
    - Continuous recognition for long audio
    - Exponential backoff retries
    - Memory-efficient streaming downloads
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

    def _extract_words(self, result: Any) -> List[Word]:
        """Extract word timings from detailed JSON result."""
        words = []
        try:
            detailed = json.loads(result.json)
            if "NBest" in detailed and detailed["NBest"]:
                for w in detailed["NBest"][0].get("Words", []):
                    words.append(Word(
                        text=w.get("Word", ""),
                        start_time=w.get("Offset", 0) / 10000000,
                        end_time=(w.get("Offset", 0) + w.get("Duration", 0)) / 10000000,
                        confidence=w.get("Confidence", 0.0)
                    ))
        except Exception as e:
            logger.warning("word_extraction_failed", error=str(e))
        return words

    @retry(
        retry=retry_if_exception_type(Exception),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True
    )
    @cached(prefix="transcript", ttl=settings.cache_ttl_transcription)
    async def transcribe(self, request: TranscriptionRequest) -> TranscriptionResponse:
        start_time = time.time()
        temp_path = None
        
        try:
            if not self.speech_config:
                raise ValueError("Azure Speech is not configured")

            # 1. Validate and download streamed
            is_valid, error = await validate_audio_url(str(request.audio_url))
            if not is_valid:
                raise ValueError(error)

            temp_path = tempfile.mktemp(suffix=".wav")
            await download_audio_streamed(str(request.audio_url), temp_path)

            # 2. Configure SDK
            audio_config = speechsdk.audio.AudioConfig(filename=temp_path)
            self.speech_config.speech_recognition_language = request.language
            recognizer = speechsdk.SpeechRecognizer(
                speech_config=self.speech_config, 
                audio_config=audio_config
            )

            # 3. Async Wrapper for Continuous Recognition
            loop = asyncio.get_event_loop()
            future = loop.create_future()
            results = []

            def handle_recognized(evt):
                if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                    results.append(evt.result)

            def handle_stop(evt):
                if not future.done():
                    loop.call_soon_threadsafe(future.set_result, True)

            recognizer.recognized.connect(handle_recognized)
            recognizer.session_stopped.connect(handle_stop)
            recognizer.canceled.connect(handle_stop)

            recognizer.start_continuous_recognition()
            try:
                # Max 5 minute timeout for processing
                await asyncio.wait_for(future, timeout=300)
            finally:
                recognizer.stop_continuous_recognition()

            # 4. Compile Response
            full_text = " ".join([r.text for r in results])
            all_words = []
            for r in results:
                all_words.extend(self._extract_words(r))

            duration = all_words[-1].end_time if all_words else 0
            
            return TranscriptionResponse(
                text=full_text,
                confidence=sum(w.confidence for w in all_words)/len(all_words) if all_words else 0.0,
                words=all_words,
                duration=duration,
                processing_time=time.time() - start_time
            )

        except Exception as e:
            logger.error("transcription_failed", error=str(e), user_id=request.user_id)
            raise
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)

transcription_service = TranscriptionService()
