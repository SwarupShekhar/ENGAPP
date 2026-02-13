"""
Async-friendly Azure Speech SDK wrapper.
Handles both transcription and pronunciation assessment.
"""
import asyncio
import io
import json
from typing import Optional, List
from concurrent.futures import ThreadPoolExecutor
import azure.cognitiveservices.speech as speechsdk
from app.core.config import settings
from app.core.logging import logger
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)

# Thread pool for CPU-bound Azure SDK operations
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="azure_speech")


class AsyncAzureSpeech:
    """
    Async wrapper for Azure Speech SDK.
    
    The Azure Speech SDK is inherently synchronous and uses callbacks.
    This wrapper provides proper async interfaces without blocking the event loop.
    """
    
    def __init__(self):
        if not settings.azure_speech_key or not settings.azure_speech_region:
            logger.warning("Azure Speech not configured")
            self.speech_config = None
            return
        
        self.speech_config = speechsdk.SpeechConfig(
            subscription=settings.azure_speech_key,
            region=settings.azure_speech_region
        )
        
        # Configure for best quality
        self.speech_config.request_word_level_timestamps()
        self.speech_config.output_format = speechsdk.OutputFormat.Detailed
        
        logger.info("Azure Speech SDK configured")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((RuntimeError, ConnectionError)),
        reraise=True
    )
    async def transcribe_from_bytes(
        self,
        audio_bytes: bytes,
        language: str = "en-US"
    ) -> dict:
        """
        Transcribe audio from bytes asynchronously.
        """
        if not self.speech_config:
            raise RuntimeError("Azure Speech not configured")
        
        logger.info(f"Starting transcription, audio size: {len(audio_bytes)} bytes")
        
        # Run in executor to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            _executor,
            self._transcribe_sync,
            audio_bytes,
            language
        )
        
        logger.info(f"Transcription completed: {len(result['text'])} characters")
        return result
    
    def _transcribe_sync(self, audio_bytes: bytes, language: str) -> dict:
        """Synchronous transcription (runs in executor)."""
        
        # Create audio config from bytes
        audio_stream = speechsdk.audio.PushAudioInputStream()
        audio_stream.write(audio_bytes)
        audio_stream.close()
        
        audio_config = speechsdk.audio.AudioConfig(stream=audio_stream)
        
        # Set language
        config = speechsdk.SpeechConfig(
            subscription=settings.azure_speech_key,
            region=settings.azure_speech_region
        )
        config.speech_recognition_language = language
        config.request_word_level_timestamps()
        config.output_format = speechsdk.OutputFormat.Detailed
        
        # Create recognizer
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=config,
            audio_config=audio_config
        )
        
        # Perform recognition (blocking)
        result = recognizer.recognize_once()
        
        # Handle result
        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            return self._parse_transcription_result(result)
        elif result.reason == speechsdk.ResultReason.NoMatch:
            raise ValueError("No speech detected in audio")
        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation = result.cancellation_details
            raise RuntimeError(f"Transcription failed: {cancellation.error_details}")
        else:
            raise RuntimeError(f"Unknown result: {result.reason}")
    
    def _parse_transcription_result(self, result) -> dict:
        """Parse Azure result into structured format."""
        words = []
        duration = 0.0
        
        try:
            # Parse detailed JSON
            detailed = json.loads(result.json)
            
            if "NBest" in detailed and len(detailed["NBest"]) > 0:
                best = detailed["NBest"][0]
                
                # Extract confidence
                confidence = best.get("Confidence", 0.0)
                
                # Extract words with timing
                for word_data in best.get("Words", []):
                    offset = word_data.get("Offset", 0) / 10000000  # Convert to seconds
                    duration_ticks = word_data.get("Duration", 0) / 10000000
                    
                    words.append({
                        "text": word_data.get("Word", ""),
                        "start_time": offset,
                        "end_time": offset + duration_ticks,
                        "confidence": word_data.get("Confidence", 0.0)
                    })
                    
                    duration = max(duration, offset + duration_ticks)
                
                return {
                    "text": result.text,
                    "confidence": confidence,
                    "words": words,
                    "duration": duration,
                    "language": detailed.get("RecognitionStatus", "")
                }
        except Exception as e:
            logger.warning(f"Failed to parse detailed results: {e}")
        
        # Fallback to basic result
        return {
            "text": result.text,
            "confidence": 0.0,
            "words": [],
            "duration": 0.0,
            "language": ""
        }
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((RuntimeError, ConnectionError)),
        reraise=True
    )
    async def assess_pronunciation(
        self,
        audio_bytes: bytes,
        reference_text: str,
        language: str = "en-US"
    ) -> dict:
        """
        Assess pronunciation asynchronously.
        """
        if not self.speech_config:
            raise RuntimeError("Azure Speech not configured")
        
        logger.info(f"Starting pronunciation assessment: '{reference_text[:50]}...'")
        
        # Run in executor
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            _executor,
            self._assess_pronunciation_sync,
            audio_bytes,
            reference_text,
            language
        )
        
        logger.info(f"Pronunciation assessment completed")
        return result
    
    def _assess_pronunciation_sync(
        self,
        audio_bytes: bytes,
        reference_text: str,
        language: str
    ) -> dict:
        """Synchronous pronunciation assessment (runs in executor)."""
        
        # Create audio config
        audio_stream = speechsdk.audio.PushAudioInputStream()
        audio_stream.write(audio_bytes)
        audio_stream.close()
        
        audio_config = speechsdk.audio.AudioConfig(stream=audio_stream)
        
        # Configure pronunciation assessment
        config = speechsdk.SpeechConfig(
            subscription=settings.azure_speech_key,
            region=settings.azure_speech_region
        )
        config.speech_recognition_language = language
        
        pronunciation_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=reference_text,
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=True
        )
        
        # Create recognizer
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=config,
            audio_config=audio_config
        )
        
        # Apply pronunciation config
        pronunciation_config.apply_to(recognizer)
        
        # Perform assessment (blocking)
        result = recognizer.recognize_once()
        
        # Handle result
        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            return self._parse_pronunciation_result(result)
        elif result.reason == speechsdk.ResultReason.NoMatch:
            raise ValueError("No speech detected for pronunciation assessment")
        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation = result.cancellation_details
            raise RuntimeError(f"Assessment failed: {cancellation.error_details}")
        else:
            raise RuntimeError(f"Unknown result: {result.reason}")
    
    def _parse_pronunciation_result(self, result) -> dict:
        """Parse pronunciation assessment result."""
        try:
            # Get pronunciation result
            pronunciation_result = speechsdk.PronunciationAssessmentResult(result)
            
            # Parse detailed JSON
            detailed = json.loads(result.properties.get(
                speechsdk.PropertyId.SpeechServiceResponse_JsonResult
            ))
            
            # Extract word-level results
            words = []
            if "NBest" in detailed and len(detailed["NBest"]) > 0:
                for word_data in detailed["NBest"][0].get("Words", []):
                    assessment = word_data.get("PronunciationAssessment", {})
                    
                    # Extract phonemes
                    phonemes = []
                    for phoneme_data in word_data.get("Phonemes", []):
                        phonemes.append({
                            "phoneme": phoneme_data.get("Phoneme", ""),
                            "accuracy_score": phoneme_data.get("Score", 0.0)
                        })
                    
                    words.append({
                        "word": word_data.get("Word", ""),
                        "accuracy_score": assessment.get("AccuracyScore", 0.0),
                        "error_type": assessment.get("ErrorType"),
                        "phonemes": phonemes
                    })
            
            return {
                "accuracy_score": pronunciation_result.accuracy_score,
                "fluency_score": pronunciation_result.fluency_score,
                "completeness_score": pronunciation_result.completeness_score,
                "pronunciation_score": pronunciation_result.pronunciation_score,
                "words": words
            }
            
        except Exception as e:
            logger.error(f"Failed to parse pronunciation result: {e}")
            raise


# Global instance
azure_speech = AsyncAzureSpeech()


async def shutdown_executor():
    """Shutdown the thread pool executor gracefully."""
    _executor.shutdown(wait=True)
    logger.info("Azure Speech executor shutdown")
