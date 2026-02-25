import numpy as np
from typing import Dict, List, Any, Optional, Tuple

class ConnectedSpeechAnalyzer:
    """
    Detects linking, reduction, and assimilation in speech using phoneme-level data.
    """
    
    LINKING_PATTERNS = {
        # Consonant-to-vowel linking
        "CV_LINKING": [
            ("k", "i"),   # "check it" -> "checki-t"
            ("n", "ɑ"),   # "turn on" -> "turno-n"
            ("t", "aʊ")   # "get out" -> "getou-t"
        ],
        # Vowel-to-vowel linking (intrusive /j/ or /w/)
        "VV_LINKING": [
            ("iː", "ɑ"),  # "see a" -> "see-ya"
            ("uː", "ɪ")   # "do it" -> "do-wit"
        ]
    }
    
    REDUCTION_PATTERNS = {
        "going to": "gonna",
        "want to": "wanna",
        "have to": "hafta",
        "got to": "gotta",
        "going to be": "gonna be"
    }
    
    def __init__(self):
        self.linking_examples = []
        self.reduction_examples = []

    def analyze(self, azure_phoneme_data: Dict[str, Any], transcript: str) -> Dict[str, Any]:
        """
        Detect connected speech features.
        
        azure_phoneme_data structure expected (from Azure NBest format):
        {
            "Words": [
                {
                    "Word": "...",
                    "Duration": ...,
                    "Offset": ...,
                    "Phonemes": [
                        {"Phoneme": "...", "Duration": ..., "Offset": ..., "Score": ...},
                        ...
                    ]
                }
            ]
        }
        """
        self.linking_examples = []
        self.reduction_examples = []
        
        words_data = azure_phoneme_data.get("Words", [])
        if not words_data:
            return self._empty_result()
            
        # Extract phoneme sequences and metadata
        phoneme_sequence = self._extract_phonemes(words_data)
        
        # Detect linking
        linking_score = self._detect_linking(phoneme_sequence)
        
        # Detect reductions
        reduction_score = self._detect_reductions(transcript, words_data)
        
        # Detect stress-timing
        stress_score = self._analyze_stress_timing(words_data)
        
        overall = (
            linking_score * 0.40 +
            reduction_score * 0.30 +
            stress_score * 0.30
        )
        
        return {
            "connected_speech_score": round(overall, 1),
            "breakdown": {
                "linking": round(linking_score, 1),
                "reduction": round(reduction_score, 1),
                "stress_timing": round(stress_score, 1)
            },
            "examples": {
                "linking_detected": self.linking_examples[:3],
                "reductions_detected": self.reduction_examples[:3]
            }
        }

    def _extract_phonemes(self, words_data: List[Dict]) -> List[List[Dict]]:
        """Extract phonemes grouped by word."""
        word_phonemes = []
        for word in words_data:
            phonemes = word.get("Phonemes", [])
            # Map simplified structures
            processed_phonemes = []
            for p in phonemes:
                processed_phonemes.append({
                    "phoneme": p.get("Phoneme") or p.get("phoneme", ""),
                    "duration": p.get("Duration") or p.get("duration", 0),
                    "offset": p.get("Offset") or p.get("offset", 0),
                    "word": word.get("Word", "")
                })
            word_phonemes.append(processed_phonemes)
        return word_phonemes

    def _is_linkable(self, end_phoneme: str, start_phoneme: str) -> bool:
        """Heuristic check for linkability."""
        # Simple implementation: Consonant at end + Vowel at start
        vowels = ["a", "e", "i", "o", "u", "æ", "ɑ", "ɔ", "ə", "ɛ", "ɪ", "ʊ", "ʌ", "aʊ", "aɪ", "ɔɪ", "eɪ", "oʊ", "iː", "uː"]
        
        # Check specific patterns
        for link_type in self.LINKING_PATTERNS.values():
            for p1, p2 in link_type:
                if end_phoneme == p1 and start_phoneme == p2:
                    return True
                    
        # General CV linking
        if end_phoneme not in vowels and start_phoneme in vowels:
            return True
            
        return False

    def _is_linked(self, p1_data: Dict, p2_data: Dict) -> bool:
        """Determine if linking occurred based on duration and proximity."""
        # Gap between words in 100ns -> ms
        gap = (p2_data["offset"] - (p1_data["offset"] + p1_data["duration"])) / 10000.0
        
        # If gap is very small (< 30ms) and phoneme duration is short, it's likely linked
        if gap < 30:
            duration_ms = p1_data["duration"] / 10000.0
            if duration_ms < 60: # Shortened for linking
                return True
        return False

    def _detect_linking(self, phoneme_sequence: List[List[Dict]]) -> float:
        opportunities = 0
        links_made = 0
        
        for i in range(len(phoneme_sequence) - 1):
            if not phoneme_sequence[i] or not phoneme_sequence[i+1]:
                continue
                
            p1 = phoneme_sequence[i][-1]
            p2 = phoneme_sequence[i+1][0]
            
            if self._is_linkable(p1["phoneme"], p2["phoneme"]):
                opportunities += 1
                if self._is_linked(p1, p2):
                    links_made += 1
                    self.linking_examples.append(f"{p1['word']} -> {p2['word']}")
        
        if opportunities == 0:
            return 70
        return (links_made / opportunities) * 100

    def _detect_reductions(self, transcript: str, words_data: List[Dict]) -> float:
        opportunities = 0
        reductions_made = 0
        
        words = transcript.lower().split()
        
        for p_key, reduced_desc in self.REDUCTION_PATTERNS.items():
            p_words = p_key.split()
            for i in range(len(words) - len(p_words) + 1):
                if words[i:i+len(p_words)] == p_words:
                    opportunities += 1
                    
                    # Analyze phoneme durations of the phrase
                    combined_duration = 0
                    for j in range(len(p_words)):
                        combined_duration += words_data[i+j].get("Duration", 0)
                    
                    # Reduction usually means shorter duration than baseline
                    # Average word duration is ~300ms, reduced phrase is often < 400ms
                    duration_ms = combined_duration / 10000.0
                    if duration_ms < (len(p_words) * 150): # Threshold for reduction
                        reductions_made += 1
                        self.reduction_examples.append(f"{p_key} -> {reduced_desc}")
                        
        if opportunities == 0:
            return 70
        return (reductions_made / opportunities) * 100

    def _analyze_stress_timing(self, words_data: List[Dict]) -> float:
        # Extract quasi-stressed elements (long vowels or high-score words)
        # Azure doesn't give explicit stress labels in basic JSON, 
        # but we can infer from Word/Phoneme durations and accuracy
        
        intervals = []
        last_stressed_time = None
        
        for word in words_data:
            dur = word.get("Duration", 0) / 10000.0
            if dur > 250: # Likely containing a stressed syllable
                start_time = word.get("Offset", 0) / 10000.0
                if last_stressed_time is not None:
                    intervals.append(start_time - last_stressed_time)
                last_stressed_time = start_time
                
        if not intervals:
            return 50
            
        # Low variance in intervals = stress-timed
        variance = np.var(intervals) / 1000.0 # Normalized variance
        
        if variance < 0.1:
            return 90
        elif variance < 0.3:
            return 75
        elif variance < 0.6:
            return 60
        else:
            return 45

    def _empty_result(self) -> Dict[str, Any]:
        return {
            "connected_speech_score": 50.0,
            "breakdown": {"linking": 50, "reduction": 50, "stress_timing": 50},
            "examples": {"linking_detected": [], "reductions_detected": []}
        }
