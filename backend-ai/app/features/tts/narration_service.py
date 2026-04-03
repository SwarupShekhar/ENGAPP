"""
Builds short English narration scripts for post-call feedback sections.
Uses deterministic templates — no AI, no external calls. Fast and cheap.
Scripts are kept under 120 words so Inworld TTS finishes in ~800-1000ms.
"""
from typing import List, Optional


_PRON_TIPS: dict = {
    "th_to_d": "Place your tongue tip lightly between your teeth and breathe out.",
    "th_to_t": "Place your tongue tip lightly between your teeth and breathe out.",
    "v_to_w": "Touch your upper teeth to your lower lip and vibrate.",
    "v_to_b": "Touch your upper teeth to your lower lip and vibrate.",
    "w_to_v": "Round your lips and push air through gently.",
    "v_to_w_reversal": "Touch your upper teeth to your lower lip and vibrate.",
    "i_to_ee": "Keep the vowel short and relaxed — do not stretch it.",
    "r_rolling": "Curl your tongue back slightly — do not trill.",
    "ae_to_e": "Open your mouth a little wider for this vowel sound.",
    "o_to_aa": "Round your lips and keep the sound short.",
    "general_mispronunciation": "Listen to a native speaker and repeat slowly.",
}

_CLOSING: dict = {
    "high": "Excellent work. Keep it up!",
    "mid": "You are on the right track. Focus on these points to level up.",
    "low": "Practice these each day — even five minutes makes a big difference.",
}


def _closing(score: int) -> str:
    if score >= 80:
        return _CLOSING["high"]
    if score >= 55:
        return _CLOSING["mid"]
    return _CLOSING["low"]


def _pron_tip(rule_category: str) -> str:
    return _PRON_TIPS.get(rule_category, "Practice this sound slowly.")


def build_pronunciation_script(
    score: int,
    justification: Optional[str],
    errors: Optional[List[dict]],
) -> str:
    parts = [f"Your pronunciation score is {score} out of 100."]
    if justification:
        j = justification.strip()[:180]
        parts.append(j)
    if errors:
        for err in errors[:2]:
            spoken = (err.get("spoken") or "").strip()
            correct = (err.get("correct") or "").strip()
            rule = (err.get("rule_category") or "").strip()
            if spoken and correct and spoken.lower() != correct.lower():
                tip = _pron_tip(rule)
                parts.append(
                    f"For example, you said '{spoken}' but the correct word is '{correct}'. {tip}"
                )
    parts.append(_closing(score))
    return " ".join(parts)


def build_grammar_script(
    score: int,
    justification: Optional[str],
    errors: Optional[List[dict]],
) -> str:
    parts = [f"Your grammar score is {score} out of 100."]
    if justification:
        parts.append(justification.strip()[:180])
    if errors:
        for err in errors[:2]:
            original = (err.get("original_text") or err.get("original") or "").strip()
            corrected = (err.get("corrected_text") or err.get("corrected") or "").strip()
            if original and corrected and original.lower() != corrected.lower():
                parts.append(
                    f"You said '{original}' — the correct form is '{corrected}'."
                )
    parts.append(_closing(score))
    return " ".join(parts)


def build_vocabulary_script(
    score: int,
    justification: Optional[str],
) -> str:
    parts = [f"Your vocabulary score is {score} out of 100."]
    if justification:
        parts.append(justification.strip()[:200])
    parts.append(_closing(score))
    return " ".join(parts)


def build_fluency_script(
    score: int,
    justification: Optional[str],
) -> str:
    parts = [f"Your fluency score is {score} out of 100."]
    if justification:
        parts.append(justification.strip()[:200])
    parts.append(_closing(score))
    return " ".join(parts)


_BUILDERS: dict = {
    "pronunciation": lambda p: build_pronunciation_script(
        p["score"], p.get("justification"), p.get("errors")
    ),
    "grammar": lambda p: build_grammar_script(
        p["score"], p.get("justification"), p.get("errors")
    ),
    "vocabulary": lambda p: build_vocabulary_script(
        p["score"], p.get("justification")
    ),
    "fluency": lambda p: build_fluency_script(
        p["score"], p.get("justification")
    ),
}


def build_narration_script(section: str, payload: dict) -> str:
    """
    Main entry point. Returns the English narration script for a given section.
    section must be one of: pronunciation, grammar, vocabulary, fluency.
    payload keys: score (int), justification (str|None), errors (list|None).
    """
    builder = _BUILDERS.get(section)
    if not builder:
        return f"Your {section} score is {payload.get('score', 0)} out of 100."
    return builder(payload)
