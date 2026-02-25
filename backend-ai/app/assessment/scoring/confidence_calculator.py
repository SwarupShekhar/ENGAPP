import numpy as np
from typing import Dict, List, Any

class ConfidenceCalculator:
    """
    Calculates confidence intervals for scores based on audio quality and sample size.
    """
    
    def calculate_confidence(self, assessment_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Returns confidence level and range for each metric.
        
        Expected assessment_data keys:
        - audio_quality: float (0-100)
        - duration: float (seconds)
        - word_count: int
        """
        
        audio_quality_score = assessment_data.get('audio_quality', 70)
        response_length_seconds = assessment_data.get('duration', 0)
        word_count = assessment_data.get('word_count', 0)
        
        # Pronunciation confidence (primarily audio quality driven)
        pronunciation_confidence = self._calculate_metric_confidence(
            audio_quality=audio_quality_score,
            sample_size=response_length_seconds,
            metric_type="pronunciation"
        )
        
        # Fluency confidence (needs longer duration)
        fluency_confidence = self._calculate_metric_confidence(
            audio_quality=audio_quality_score,
            sample_size=response_length_seconds,
            metric_type="fluency"
        )
        
        # Grammar/Vocab confidence (depends on word count/transcript accuracy)
        grammar_confidence = self._calculate_metric_confidence(
            audio_quality=audio_quality_score,
            sample_size=word_count,
            metric_type="grammar"
        )
        
        overall_score = (
            pronunciation_confidence['score'] * 0.4 +
            fluency_confidence['score'] * 0.3 +
            grammar_confidence['score'] * 0.3
        )
        
        level = "HIGH" if overall_score >= 90 else "MEDIUM" if overall_score >= 75 else "LOW"
        
        return {
            "overall_confidence": {
                "level": level,
                "score": round(overall_score, 1)
            },
            "by_metric": {
                "pronunciation": pronunciation_confidence,
                "fluency": fluency_confidence,
                "grammar": grammar_confidence,
                "vocabulary": grammar_confidence,
                "comprehension": grammar_confidence
            }
        }
    
    def _calculate_metric_confidence(
        self,
        audio_quality: float,
        sample_size: float,
        metric_type: str
    ) -> Dict[str, Any]:
        """
        Returns confidence level and margin of error.
        """
        
        # Base confidence from audio quality
        if audio_quality >= 90:
            base_confidence = 0.95
        elif audio_quality >= 75:
            base_confidence = 0.85
        elif audio_quality >= 60:
            base_confidence = 0.70
        else:
            base_confidence = 0.50
        
        # Adjust for sample size
        if metric_type == "pronunciation":
            min_sample = 30  # seconds
        elif metric_type == "fluency":
            min_sample = 45  # seconds
        else:  # grammar, vocab
            min_sample = 50  # words
        
        # Sample factor: how much of the required sample we have
        sample_factor = min(1.0, (sample_size / min_sample) if min_sample > 0 else 1.0)
        
        # Penalty for extremely short samples
        if sample_factor < 0.2:
            sample_factor *= 0.5
            
        final_confidence = base_confidence * sample_factor
        
        # Calculate margin of error (± points)
        # Higher confidence = smaller margin
        margin = round((1 - final_confidence) * 15, 1)  # Max ±15 points
        
        if final_confidence >= 0.90:
            level = "HIGH"
        elif final_confidence >= 0.75:
            level = "MEDIUM"
        else:
            level = "LOW"
        
        return {
            "level": level,
            "score": round(final_confidence * 100, 1),
            "margin_of_error": margin
        }
