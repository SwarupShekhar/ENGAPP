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


def build_full_feedback_script(
    pronunciation_issues: Optional[List[dict]] = None,
    grammar_mistakes: Optional[List[dict]] = None,
    vocabulary_issues: Optional[List[dict]] = None,
    scores: Optional[dict] = None,
    justifications: Optional[dict] = None,
) -> str:
    """
    Builds one complete sequential feedback narration covering ALL sections.
    This is played as a single audio on the feedback screen — the user hears
    their entire feedback read aloud without needing to tap each section.

    Kept under 300 words so TTS stays under ~2000ms.
    """
    parts: List[str] = []
    scores = scores or {}
    justifications = justifications or {}

    parts.append("Here is your feedback from today's call.")

    # ── Pronunciation ────────────────────────────────────────────────────
    pron_score = int(scores.get("pronunciation", 0))
    pron_issues = pronunciation_issues or []
    if pron_score > 0 or pron_issues:
        if pron_score >= 80:
            parts.append(f"Pronunciation: Great job! Your score is {pron_score} out of 100.")
        elif pron_score >= 55:
            parts.append(f"Pronunciation: Your score is {pron_score} out of 100. A few areas to refine.")
        else:
            parts.append(f"Pronunciation: Your score is {pron_score} out of 100. Focus on these sounds.")

        for err in pron_issues[:4]:
            spoken = (err.get("spoken") or err.get("word") or "").strip()
            correct = (err.get("correct") or "").strip()
            rule = (err.get("rule_category") or "").strip()
            if spoken and correct and spoken.lower() != correct.lower():
                tip = _pron_tip(rule)
                parts.append(
                    f"You said '{spoken}' — the correct pronunciation is '{correct}'. {tip}"
                )
        jus = (justifications.get("pronunciation") or "").strip()
        if jus and len(pron_issues) == 0:
            parts.append(jus[:160])

    # ── Grammar ──────────────────────────────────────────────────────────
    grammar_score = int(scores.get("grammar", 0))
    grammar_errors = grammar_mistakes or []
    if grammar_score > 0 or grammar_errors:
        if grammar_score >= 80:
            parts.append(f"Grammar: Excellent! Your score is {grammar_score} out of 100.")
        else:
            parts.append(f"Grammar: Your score is {grammar_score} out of 100.")

        for err in grammar_errors[:3]:
            original = (err.get("original_text") or err.get("original") or "").strip()
            corrected = (err.get("corrected_text") or err.get("corrected") or "").strip()
            if original and corrected and original.lower() != corrected.lower():
                parts.append(f"You said '{original}' — the correct form is '{corrected}'.")
        jus = (justifications.get("grammar") or "").strip()
        if jus and len(grammar_errors) == 0:
            parts.append(jus[:160])

    # ── Vocabulary ───────────────────────────────────────────────────────
    vocab_score = int(scores.get("vocabulary", 0))
    if vocab_score > 0:
        jus = (justifications.get("vocabulary") or "").strip()
        if vocab_score >= 80:
            parts.append(f"Vocabulary: Impressive range — {vocab_score} out of 100.")
        else:
            parts.append(f"Vocabulary: Your score is {vocab_score} out of 100.")
            if jus:
                parts.append(jus[:140])

    # ── Fluency ──────────────────────────────────────────────────────────
    fluency_score = int(scores.get("fluency", 0))
    if fluency_score > 0:
        jus = (justifications.get("fluency") or "").strip()
        if fluency_score >= 80:
            parts.append(f"Fluency: You spoke smoothly — {fluency_score} out of 100.")
        else:
            parts.append(f"Fluency: Your score is {fluency_score} out of 100.")
            if jus:
                parts.append(jus[:140])

    # ── Closing ──────────────────────────────────────────────────────────
    overall = pron_score or grammar_score or vocab_score or fluency_score
    parts.append(_closing(overall))

    return " ".join(parts)
