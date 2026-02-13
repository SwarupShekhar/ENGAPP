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

    @cached(prefix="pronunciation", ttl=settings.cache_ttl_pronunciation)
    async def assess(self, request: PronunciationRequest) -> PronunciationResponse:
        start_time = time.time()
        temp_path = None
        
        try:
            from app.utils.async_azure_speech import azure_speech
            
            # 1. Download & Validate (Need file for librosa)
            temp_path = tempfile.mktemp(suffix=".wav")
            await download_audio_streamed(str(request.audio_url), temp_path)
            
            with open(temp_path, "rb") as f:
                audio_bytes = f.read()

            # 2. Parallel Prosody Analysis (Keep using the file for librosa)
            prosody_metrics = await self._analyze_prosody(temp_path)

            # 3. Enhanced Azure Assessment
            result = await azure_speech.assess_pronunciation(
                audio_bytes,
                request.reference_text,
                language=request.language
            )

            # 4. Map Results
            words = [
                WordPronunciation(
                    word=w["word"],
                    accuracy_score=w["accuracy_score"],
                    error_type=w["error_type"],
                    phonemes=[
                        PhonemeScore(phoneme=p["phoneme"], accuracy_score=p["accuracy_score"])
                        for p in w["phonemes"]
                    ]
                ) for w in result["words"]
            ]
            
            return PronunciationResponse(
                accuracy_score=result["accuracy_score"],
                fluency_score=result["fluency_score"],
                completeness_score=result["completeness_score"],
                pronunciation_score=result["pronunciation_score"],
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
