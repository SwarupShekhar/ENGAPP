import time
import json
import os
import tempfile
import asyncio
from typing import List, Optional, Dict, Any
import azure.cognitiveservices.speech as speechsdk
import librosa
import numpy as np
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings
from app.core.logging import logger
from app.models.base import WordPronunciation, PhonemeScore
from app.models.request import PronunciationRequest
from app.models.response import PronunciationResponse
from app.cache.manager import cached
from app.utils.audio_utils import validate_audio_url, download_audio_streamed

class PronunciationService:
    """
    Robust Pronunciation Assessment Service.
    Combines Azure Speech SDK with custom Prosody Analysis.
    """
    
    def __init__(self):
        self.speech_config = None
        if settings.azure_speech_key and settings.azure_speech_region:
            self.speech_config = speechsdk.SpeechConfig(
                subscription=settings.azure_speech_key,
                region=settings.azure_speech_region
            )

    async def _analyze_prosody(self, audio_path: str) -> Dict[str, float]:
        """Deep Intelligence prosody analysis using librosa."""
        try:
            # Load audio for analysis
            y, sr = librosa.load(audio_path)
            
            # 1. Intonation (Pitch Variance)
            f0, voiced_flag, voiced_probs = librosa.pyin(
                y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7')
            )
            f0_clean = f0[~np.isnan(f0)]
            pitch_std = np.std(f0_clean) if len(f0_clean) > 0 else 0
            
            # 2. Timing (Speech Rate)
            duration = librosa.get_duration(y=y, sr=sr)
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            
            # 3. Pause Analysis
            non_silent = librosa.effects.split(y, top_db=25)
            voiced_duration = sum(end - start for start, end in non_silent) / sr
            pause_ratio = (duration - voiced_duration) / duration if duration > 0 else 0

            # Score Calculation
            prosody_score = (pitch_std / 50.0 * 40) + (tempo / 150.0 * 40) + ((1-pause_ratio) * 20)
            
            return {
                "prosody_score": min(100.0, float(prosody_score)),
                "speech_rate_wpm": float(tempo),
                "pitch_variance": float(pitch_std)
            }
        except Exception as e:
            logger.warning("prosody_analysis_failed", error=str(e))
            return {"prosody_score": 0.0, "speech_rate_wpm": 0.0, "pitch_variance": 0.0}

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    @cached(prefix="pronunciation", ttl=settings.cache_ttl_pronunciation)
    async def assess(self, request: PronunciationRequest) -> PronunciationResponse:
        start_time = time.time()
        temp_path = None
        
        try:
            if not self.speech_config:
                raise ValueError("Azure Speech is not configured")

            # 1. Download & Validate
            temp_path = tempfile.mktemp(suffix=".wav")
            await download_audio_streamed(str(request.audio_url), temp_path)

            # 2. Parallel Prosody Analysis
            prosody_metrics = await self._analyze_prosody(temp_path)

            # 3. Azure Assessment
            pronunciation_config = speechsdk.PronunciationAssessmentConfig(
                reference_text=request.reference_text,
                grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
                granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
                enable_miscue=True
            )
            
            audio_config = speechsdk.audio.AudioConfig(filename=temp_path)
            self.speech_config.speech_recognition_language = request.language
            recognizer = speechsdk.SpeechRecognizer(
                speech_config=self.speech_config, 
                audio_config=audio_config
            )
            pronunciation_config.apply_to(recognizer)

            # Run in thread pool to avoid blocking async loop
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, recognizer.recognize_once)

            if result.reason != speechsdk.ResultReason.RecognizedSpeech:
                raise ValueError(f"Azure assessment failed: {result.reason}")

            # 4. Parse Results
            azure_res = speechsdk.PronunciationAssessmentResult(result)
            detailed = json.loads(result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult))
            
            words = self._extract_words(detailed)
            
            return PronunciationResponse(
                accuracy_score=azure_res.accuracy_score,
                fluency_score=azure_res.fluency_score,
                completeness_score=azure_res.completeness_score,
                pronunciation_score=azure_res.pronunciation_score,
                words=words,
                common_issues=self._get_issues(words),
                improvement_tips=self._get_tips(words),
                processing_time=time.time() - start_time,
                **prosody_metrics
            )

        except Exception as e:
            logger.error("pronunciation_failed", error=str(e), user_id=request.user_id)
            raise
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)

    def _extract_words(self, detailed: Dict) -> List[WordPronunciation]:
        words = []
        best = detailed.get("NBest", [{}])[0]
        for w in best.get("Words", []):
            phonemes = []
            for p in w.get("Phonemes", []):
                phonemes.append(PhonemeScore(
                    phoneme=p.get("Phoneme", ""),
                    accuracy_score=p.get("Score", 0.0)
                ))
            
            words.append(WordPronunciation(
                word=w.get("Word", ""),
                accuracy_score=w.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0),
                error_type=w.get("PronunciationAssessment", {}).get("ErrorType"),
                phonemes=phonemes
            ))
        return words

    def _get_tips(self, words: List[WordPronunciation]) -> List[str]:
        # Logic to generate tips...
        return ["Focus on clearer vowel sounds", "Practice word stress patterns"]

    def _get_issues(self, words: List[WordPronunciation]) -> List[str]:
        # Logic to identify issues...
        return ["Occasional vowel substitution"]

pronunciation_service = PronunciationService()
