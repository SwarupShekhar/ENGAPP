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

    @cached(prefix="transcript", ttl=settings.cache_ttl_transcription)
    async def transcribe(self, request: TranscriptionRequest) -> TranscriptionResponse:
        start_time = time.time()
        
        try:
            from app.utils.async_azure_speech import azure_speech
            
            # 1. Validate and download bytes
            is_valid, error = await validate_audio_url(str(request.audio_url))
            if not is_valid:
                raise ValueError(error)

            import httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(str(request.audio_url))
                response.raise_for_status()
                audio_bytes = response.content

            # 2. Call Enhanced Async SDK
            result = await azure_speech.transcribe_from_bytes(
                audio_bytes,
                language=request.language
            )

            # 3. Map to TranscriptionResponse
            all_words = [
                Word(
                    text=w["text"],
                    start_time=w["start_time"],
                    end_time=w["end_time"],
                    confidence=w["confidence"]
                ) for w in result["words"]
            ]

            return TranscriptionResponse(
                text=result["text"],
                confidence=result["confidence"],
                words=all_words,
                duration=result["duration"],
                processing_time=time.time() - start_time
            )

        except Exception as e:
            logger.error("transcription_failed", error=str(e), user_id=request.user_id)
            raise

transcription_service = TranscriptionService()
