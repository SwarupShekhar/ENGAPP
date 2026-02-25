import numpy as np
from typing import Dict, List, Any
from app.assessment.scoring.connected_speech_analyzer import ConnectedSpeechAnalyzer

class FluencyRecalibrator:
    """
    Incorporates prosody, speech rate, and connected speech features.
    """
    
    def __init__(self):
        self.connected_speech_analyzer = ConnectedSpeechAnalyzer()
    
    def recalibrate_fluency(
        self,
        azure_fluency: float,      # 0-100
        azure_prosody: float,      # 0-100
        speech_rate_wpm: float,
        pause_data: Dict[str, Any],
        word_durations: List[float],
        azure_phoneme_data: Dict[str, Any],
        transcript: str
    ) -> Dict[str, Any]:
        """
        Returns multi-dimensional fluency breakdown.
        """
        
        # Component 1: Speech Flow (35%)
        flow_score = self._calculate_flow_score(
            azure_fluency,
            speech_rate_wpm,
            pause_data
        )
        
        # Component 2: Connected Speech (30%) - NEW
        connected_speech_result = self.connected_speech_analyzer.analyze(
            azure_phoneme_data,
            transcript
        )
        cs_score = connected_speech_result['connected_speech_score']
        
        # Component 3: Prosodic Quality (20%)
        prosody_score = self._adjust_prosody(azure_prosody)
        
        # Component 4: Pace Control (15%)
        pace_score = self._calculate_pace_control(
            speech_rate_wpm,
            word_durations
        )
        
        # Weighted final score
        # Using cs_score instead of the previous robotic-detection-based naturalness_score
        final_fluency = (
            flow_score * 0.35 +
            cs_score * 0.30 +
            prosody_score * 0.20 +
            pace_score * 0.15
        )
        
        return {
            "overall_fluency": round(final_fluency, 1),
            "components": {
                "speech_flow": round(flow_score, 1),
                "connected_speech": round(cs_score, 1),
                "prosody": round(prosody_score, 1),
                "pace_control": round(pace_score, 1)
            },
            "connected_speech_details": connected_speech_result['breakdown'],
            "examples": connected_speech_result['examples'],
            "azure_raw": {
                "fluency": azure_fluency,
                "prosody": azure_prosody
            }
        }
    
    def _calculate_flow_score(self, azure_fluency: float, wpm: float, pauses: Dict[str, Any]) -> float:
        """
        Azure fluency as starting point, with adjustments for WPM and mid-phrase pauses.
        """
        base = azure_fluency
        
        # Penalize if speech rate is TOO consistent or extreme
        # (Natural speakers vary between 120-180 WPM)
        if 130 <= wpm <= 170:
            rate_adjustment = 0  # Acceptable range
        elif wpm < 100:
            rate_adjustment = -15  # Too slow
        elif wpm > 200:
            rate_adjustment = -10  # Too fast
        else:
            rate_adjustment = -5   # Slightly off
        
        # Penalize excessive pauses
        unnatural_pauses = pauses.get('mid_phrase_count', 0)
        pause_penalty = min(unnatural_pauses * 3, 20)
        
        return max(0, base + rate_adjustment - pause_penalty)
    
    def _calculate_naturalness(self, prosody: float, word_durations: List[float]) -> float:
        """
        Detect robotic speech patterns using word duration variance.
        """
        if not word_durations:
            return prosody * 0.85

        # If prosody is high, speaker is likely natural
        if prosody >= 80:
            return 85
        
        # Check word duration variance
        # Robotic speakers have very consistent word lengths
        duration_std = np.std(word_durations)
        
        if duration_std < 50:  # Very consistent (robotic)
            variance_penalty = 30
        elif duration_std < 100:
            variance_penalty = 15
        else:
            variance_penalty = 0
        
        # Base naturalness on prosody, minus robotic penalty
        base = prosody * 0.85  # Scale down Azure's generous prosody
        return max(30, base - variance_penalty)
    
    def _adjust_prosody(self, azure_prosody: float) -> float:
        """
        Azure prosody tends to be 10-15 points too high.
        Apply conservative scaling.
        """
        # Non-linear scaling: compress high scores
        if azure_prosody >= 90:
            return 75 + (azure_prosody - 90) * 0.5
        elif azure_prosody >= 70:
            return 60 + (azure_prosody - 70) * 0.75
        else:
            return azure_prosody * 0.85
    
    def _calculate_pace_control(self, wpm: float, word_durations: List[float]) -> float:
        """
        Reward natural pace variation.
        """
        if not word_durations:
            return 50

        avg_duration = np.mean(word_durations)
        variance = np.std(word_durations)
        
        # Coefficient of variation
        cv = variance / avg_duration if avg_duration > 0 else 0
        
        # Ideal CV for natural speech: 0.3-0.6
        if 0.3 <= cv <= 0.6:
            return 80
        elif 0.2 <= cv < 0.3 or 0.6 < cv <= 0.8:
            return 65
        else:
            return 50  # Too consistent or too erratic
