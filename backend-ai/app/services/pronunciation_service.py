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
import base64

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
                "pitch_variance": float(pitch_std),
                "energy_level": float(np.mean(librosa.feature.rms(y=y)) * 100), # Simple energy metric
                "speaking_confidence": float(min(100.0, max(0.0, 100 - (pause_ratio * 100) - (pitch_std / 2)))) # Heuristic confidence
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
            
            # 1. Get audio data: from base64 or download from URL
            temp_path = tempfile.mktemp(suffix=".wav")
            if request.audio_base64:
                try:
                    # Robust handling: Convert whatever format to WAV 16kHz via pydub/ffmpeg
                    import io
                    from pydub import AudioSegment
                    
                    audio_bytes = base64.b64decode(request.audio_base64)
                    
                    # Log snippet for debugging
                    logger.debug(f"Decoding base64 audio ({len(audio_bytes)} bytes)")
                    
                    # Convert to AudioSegment (pydub handles M4A, MP3, etc. via ffmpeg)
                    audio_segment = AudioSegment.from_file(io.BytesIO(audio_bytes))
                    
                    # Normalize to 16kHz mono (Azure requirement)
                    audio_segment = audio_segment.set_frame_rate(16000).set_channels(1)
                    
                    # Export as valid WAV
                    audio_segment.export(temp_path, format="wav")
                    logger.info(f"Converted audio to WAV: {temp_path}")
                    
                except Exception as e:
                    # Fallback or re-raise with better message
                    logger.error(f"Audio conversion failed: {e}. Is ffmpeg installed?")
                    # Try writing raw bytes as fallback if conversion fails (e.g. absent ffmpeg)
                    # But warn that it might fail later
                    with open(temp_path, "wb") as f:
                        f.write(audio_bytes)
            elif request.audio_url:
                await download_audio_streamed(str(request.audio_url), temp_path)
            else:
                raise ValueError("Either audio_url or audio_base64 must be provided")
            
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

            # 4. Extract Detailed Feedback using Analyzer
            from app.utils.pronunciation_analyzer import extract_detailed_errors, generate_actionable_feedback
            from app.models.response import DetailedPronunciationFeedback, ActionableFeedback, MispronuncedWord, WeakPhoneme

            # Parse full Azure JSON for detailed analysis containing NBest/Phonemes
            azure_json_str = result.get("azure_json", "{}")
            if isinstance(azure_json_str, str):
                azure_json = json.loads(azure_json_str)
            else:
                azure_json = azure_json_str

            if not azure_json and "words" in result and result["words"]:
                 # Fallback if azure_json not returned: reconstruct minimal structure from simplified result
                 azure_json = {"NBest": [{"Words": result["words"]}]}

            detailed_errors_dict = extract_detailed_errors(azure_json)
            
            # Generate actionable tips (accent_notes will be passed in a separate flow or null for now)
            actionable_feedback_dict = generate_actionable_feedback(detailed_errors_dict, accent_notes=None)

            # Convert to Pydantic models
            detailed_errors = DetailedPronunciationFeedback(
                mispronounced_words=[MispronuncedWord(**w) for w in detailed_errors_dict["mispronounced_words"]],
                weak_phonemes=[WeakPhoneme(**p) for p in detailed_errors_dict["weak_phonemes"]],
                problem_sounds=detailed_errors_dict["problem_sounds"],
                omitted_words=detailed_errors_dict["omitted_words"],
                inserted_words=detailed_errors_dict["inserted_words"],
                word_level_scores=detailed_errors_dict["word_level_scores"]
            )

            actionable_feedback = ActionableFeedback(
                practice_words=actionable_feedback_dict["practice_words"],
                phoneme_tips=actionable_feedback_dict["phoneme_tips"],
                accent_specific_tips=actionable_feedback_dict["accent_specific_tips"],
                strengths=actionable_feedback_dict["strengths"]
            )

            # 5. Map Results
            words = [
                WordPronunciation(
                    word=w["word"],
                    accuracy_score=w.get("accuracy_score") or w.get("AccuracyScore", 0.0),
                    error_type=w.get("error_type") or w.get("ErrorType", "None"),
                    phonemes=[
                        PhonemeScore(
                            phoneme=p.get("phoneme") or p.get("Phoneme", ""), 
                            accuracy_score=p.get("accuracy_score") or p.get("Score", 0.0)
                        )
                        for p in w.get("phonemes") or w.get("Phonemes", [])
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
                # Deep Intelligence
                **prosody_metrics,
                # Detailed Feedback
                detailed_errors=detailed_errors,
                actionable_feedback=actionable_feedback,
                word_level_data=detailed_errors_dict["word_level_scores"],
                emotion_data={
                    "energy_level": prosody_metrics.get("energy_level", 0.0),
                    "speaking_confidence": prosody_metrics.get("speaking_confidence", 0.0),
                    "emotional_tone": "Neutral", # Placeholder for future ML model
                    "confidence_level": "High" if prosody_metrics.get("speaking_confidence", 0) > 70 else "Medium"
                }
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
