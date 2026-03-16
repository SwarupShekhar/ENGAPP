"""
Detailed pronunciation error analysis from Azure Speech SDK results
"""
from typing import Dict, List, Any, Optional
import logging

logger = logging.getLogger(__name__)

# Phoneme teaching tips mapping
PHONEME_TIPS = {
    "θ": "The 'th' sound in 'think' - place tongue between teeth, no voice",
    "ð": "The 'th' sound in 'this' - place tongue between teeth, add voice",
    "ɜː": "The 'er' sound in 'bird' - curl tongue back slightly",
    "æ": "The 'a' sound in 'cat' - open mouth wider than 'e'",
    "r": "American 'r' - curl tongue tip back without touching roof of mouth",
    "w": "The 'w' sound - round lips and glide into vowel",
    "v": "The 'v' sound - bite lower lip with upper teeth and voice",
    "ʌ": "The 'uh' sound in 'cup' - relaxed open mouth",
    "ɔː": "The 'aw' sound in 'law' - open mouth, round lips",
    "ə": "The schwa sound in 'about' - the most common English vowel, very relaxed",
}

# Accent-specific common issues
ACCENT_PATTERNS = {
    "Hindi": {
        "v_w_confusion": ["v", "w"],
        "retroflex_r": ["r"],
        "aspirated_stops": ["p", "t", "k"],
        "th_substitution": ["θ", "ð"]
    },
    "Spanish": {
        "b_v_confusion": ["b", "v"],
        "vowel_length": ["iː", "uː"],
        "final_consonants": ["d", "t", "s"]
    },
    "French": {
        "r_sound": ["r"],
        "h_dropping": ["h"],
        "nasal_vowels": ["æ", "ɑː"]
    },
    "Chinese": {
        "l_r_confusion": ["l", "r"],
        "final_consonants": ["t", "d", "k"],
        "th_substitution": ["θ", "ð"]
    }
}


def extract_detailed_errors(azure_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract word-level and phoneme-level errors from Azure Speech SDK response
    
    Args:
        azure_result: Full JSON response from Azure Speech SDK
        
    Returns:
        Dictionary with detailed error analysis
    """
    errors = {
        "mispronounced_words": [],
        "weak_phonemes": [],
        "omitted_words": [],
        "inserted_words": [],
        "problem_sounds": {},
        "word_level_scores": []
    }
    
    try:
        # Navigate Azure's nested JSON structure
        nbest = azure_result.get("NBest", [])
        if not nbest:
            logger.warning("No NBest array in Azure result")
            return errors
            
        best_result = nbest[0]
        words = best_result.get("Words", [])
        
        for idx, word_data in enumerate(words):
            word = word_data.get("Word", "")
            pronunciation = word_data.get("PronunciationAssessment", {})
            accuracy = pronunciation.get("AccuracyScore", 100)
            error_type = pronunciation.get("ErrorType", "None")
            
            # Store word-level score for UI display
            word_score_data = {
                "word": word,
                "accuracy": accuracy,
                "error_type": error_type,
                "position": idx
            }
            errors["word_level_scores"].append(word_score_data)
            
            # Flag mispronounced words (threshold: 70)
            if accuracy < 70:
                errors["mispronounced_words"].append({
                    "word": word,
                    "accuracy": accuracy,
                    "error_type": error_type,
                    "position_in_text": idx
                })
            
            # Analyze phoneme-level issues
            phonemes = word_data.get("Phonemes", [])
            for phoneme_data in phonemes:
                phoneme_symbol = phoneme_data.get("Phoneme", "")
                phoneme_score = phoneme_data.get("Score", 100)
                
                # Flag weak phonemes (threshold: 60)
                if phoneme_score < 60:
                    errors["weak_phonemes"].append({
                        "word": word,
                        "phoneme": phoneme_symbol,
                        "score": phoneme_score,
                        "ipa_symbol": phoneme_symbol
                    })
                    
                    # Track recurring phoneme issues
                    if phoneme_symbol not in errors["problem_sounds"]:
                        errors["problem_sounds"][phoneme_symbol] = 0
                    errors["problem_sounds"][phoneme_symbol] += 1
            
            # Track omissions and insertions
            if error_type == "Omission":
                errors["omitted_words"].append(word)
            elif error_type == "Insertion":
                errors["inserted_words"].append(word)
                
    except Exception as e:
        logger.error(f"Error extracting pronunciation details: {str(e)}")
    
    return errors


def generate_actionable_feedback(
    errors: Dict[str, Any], 
    accent_notes: Optional[str] = None
) -> Dict[str, List[str]]:
    """
    Convert technical errors into user-friendly practice recommendations
    
    Args:
        errors: Output from extract_detailed_errors()
        accent_notes: Optional accent analysis from Gemini AI
        
    Returns:
        Dictionary with categorized feedback lists
    """
    feedback = {
        "practice_words": [],
        "phoneme_tips": [],
        "accent_specific_tips": [],
        "strengths": []
    }
    
    # 1. Identify worst mispronounced words (top 3)
    if errors["mispronounced_words"]:
        worst_words = sorted(
            errors["mispronounced_words"], 
            key=lambda x: x["accuracy"]
        )[:3]
        
        for word_info in worst_words:
            word = word_info["word"]
            accuracy = word_info["accuracy"]
            feedback["practice_words"].append(
                f"{word} ({int(accuracy)}/100)"
            )
    
    # 2. Generate phoneme-specific tips (top 2 recurring issues)
    if errors["problem_sounds"]:
        top_issues = sorted(
            errors["problem_sounds"].items(), 
            key=lambda x: x[1], 
            reverse=True
        )[:2]
        
        for phoneme, count in top_issues:
            if phoneme in PHONEME_TIPS:
                tip = f"⚠️ '{phoneme}' sound (appeared {count}× with low scores): {PHONEME_TIPS[phoneme]}"
                feedback["phoneme_tips"].append(tip)
    
    # 3. Accent-specific recommendations
    if accent_notes:
        detected_accent = None
        for accent_name in ACCENT_PATTERNS.keys():
            if accent_name.lower() in accent_notes.lower():
                detected_accent = accent_name
                break
        
        if detected_accent:
            accent_patterns = ACCENT_PATTERNS[detected_accent]
            problem_phonemes = set(errors["problem_sounds"].keys())
            
            # Check for v/w confusion (common in Hindi speakers)
            if detected_accent == "Hindi":
                if "v" in problem_phonemes or "w" in problem_phonemes:
                    feedback["accent_specific_tips"].append(
                        "Focus on 'v' vs 'w': For 'v', bite your lower lip with upper teeth and add voice. For 'w', round your lips."
                    )
                
                if "θ" in problem_phonemes or "ð" in problem_phonemes:
                    feedback["accent_specific_tips"].append(
                        "English 'th' sounds don't exist in Hindi. Practice placing tongue between teeth, not behind them."
                    )
            
            # Add more accent-specific patterns as needed
    
    # 4. Identify strengths (words with high accuracy)
    high_accuracy_words = [
        w for w in errors["word_level_scores"] 
        if w["accuracy"] >= 85 and w["error_type"] == "None"
    ]
    
    if high_accuracy_words:
        if len(high_accuracy_words) >= 5:
            feedback["strengths"].append("Consistent pronunciation across most words")
        if any(len(w["word"]) > 8 for w in high_accuracy_words):
            feedback["strengths"].append("Good accuracy on longer, complex words")
    
    return feedback


def analyze_pronunciation_trends(
    current_errors: Dict[str, Any],
    historical_errors: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Track pronunciation improvement over time
    
    Args:
        current_errors: Current session errors
        historical_errors: List of error dicts from previous sessions
        
    Returns:
        Trend analysis with improvement/regression indicators
    """
    trends = {
        "improving_sounds": [],
        "persistent_issues": [],
        "new_issues": []
    }
    
    if not historical_errors or len(historical_errors) < 2:
        return trends
    
    # Compare current problem sounds with historical data
    current_problems = set(current_errors["problem_sounds"].keys())
    
    # Get problem sounds from last 3 sessions
    recent_sessions = historical_errors[-3:]
    historical_problems = set()
    for session in recent_sessions:
        historical_problems.update(session.get("problem_sounds", {}).keys())
    
    # Identify trends
    trends["improving_sounds"] = list(historical_problems - current_problems)
    trends["persistent_issues"] = list(current_problems & historical_problems)
    trends["new_issues"] = list(current_problems - historical_problems)
    
    return trends
