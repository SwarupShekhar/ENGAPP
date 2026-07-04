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


def coaching_line(
    spoken: Optional[str],
    correct: Optional[str],
    rule_category: Optional[str] = None,
    *,
    include_tip: bool = False,
) -> Optional[str]:
    """
    One pronunciation coaching sentence for TTS (word-only, no sentence context).

    Never drops an error when spoken == correct (ASR may match the target
    word while the sound is still wrong). Never invents phonetic spellings.
    Tips are usually appended once at the end of the segment script (include_tip=False).
    """
    spoken_w = (spoken or "").strip()
    correct_w = (correct or "").strip()
    if not spoken_w and not correct_w:
        return None
    target = correct_w or spoken_w
    has_contrast = (
        bool(spoken_w)
        and spoken_w != "—"
        and spoken_w.lower() != target.lower()
    )
    if has_contrast:
        line = f"You said '{spoken_w}'. Try saying '{target}'."
    else:
        line = f"Your word '{target}' wasn't clear. Say '{target}' like this."
    if include_tip:
        line = f"{line} {_pron_tip((rule_category or '').strip())}"
    return line


def slow_words_from_errors(errors: Optional[List[dict]], limit: int = 2) -> List[str]:
    """Unique correct words for slow-model clips (order preserved)."""
    words: List[str] = []
    seen: set[str] = set()
    for err in errors or []:
        if len(words) >= limit:
            break
        correct = (err.get("correct") or "").strip()
        if not correct:
            continue
        key = correct.lower()
        if key in seen:
            continue
        seen.add(key)
        words.append(correct)
    return words


def build_pronunciation_script(
    score: int,
    justification: Optional[str],
    errors: Optional[List[dict]],
) -> str:
    """
    Coaching block only (no slow words). Up to 2 issues; one dominant-pattern tip at end.
    """
    parts = [f"Your pronunciation score is {score} out of 100."]
    error_list = list(errors or [])[:2]
    if justification and not error_list:
        j = justification.strip()[:180]
        if j:
            parts.append(j)
    for err in error_list:
        line = coaching_line(
            err.get("spoken"),
            err.get("correct"),
            err.get("rule_category"),
            include_tip=False,
        )
        if line:
            parts.append(line)
    if error_list:
        dominant_rule = (error_list[0].get("rule_category") or "").strip()
        if dominant_rule:
            parts.append(_pron_tip(dominant_rule))
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
                    f"You said '{original}'. The correct form is '{corrected}'."
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
    first_name: Optional[str] = None,
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

    greeting = f"Hey {first_name}!" if first_name else "Hey!"
    parts.append(f"{greeting} Let me walk you through your feedback from today's call.")

    # ── Pronunciation ────────────────────────────────────────────────────
    pron_score = int(scores.get("pronunciation", 0))
    pron_issues = pronunciation_issues or []
    if pron_score > 0 or pron_issues:
        if pron_score >= 80:
            parts.append(f"For pronunciation, you scored {pron_score} out of 100. That is excellent work.")
        elif pron_score >= 55:
            parts.append(f"For pronunciation, you scored {pron_score} out of 100. There are a couple of things to work on.")
        else:
            parts.append(f"For pronunciation, you scored {pron_score} out of 100. Let us focus on a few key sounds.")

        for err in pron_issues[:4]:
            line = coaching_line(
                err.get("spoken") or err.get("word"),
                err.get("correct"),
                err.get("rule_category"),
                include_tip=False,
            )
            if line:
                parts.append(line)
        if pron_issues:
            dominant_rule = (pron_issues[0].get("rule_category") or "").strip()
            if dominant_rule:
                parts.append(_pron_tip(dominant_rule))
        jus = (justifications.get("pronunciation") or "").strip()
        if jus and len(pron_issues) == 0:
            parts.append(jus[:160])

    # ── Grammar ──────────────────────────────────────────────────────────
    grammar_score = int(scores.get("grammar", 0))
    grammar_errors = grammar_mistakes or []
    if grammar_score > 0 or grammar_errors:
        if grammar_score >= 80:
            parts.append(f"Moving on to grammar — you scored {grammar_score} out of 100. Excellent work.")
        else:
            parts.append(f"Moving on to grammar — you scored {grammar_score} out of 100.")

        for err in grammar_errors[:3]:
            original = (err.get("original_text") or err.get("original") or "").strip()
            corrected = (err.get("corrected_text") or err.get("corrected") or "").strip()
            if original and corrected and original.lower() != corrected.lower():
                parts.append(
                    f"You said '{original}'. The correct form is '{corrected}'."
                )
        jus = (justifications.get("grammar") or "").strip()
        if jus and len(grammar_errors) == 0:
            parts.append(jus[:160])

    # ── Vocabulary ───────────────────────────────────────────────────────
    vocab_score = int(scores.get("vocabulary", 0))
    if vocab_score > 0:
        jus = (justifications.get("vocabulary") or "").strip()
        if vocab_score >= 80:
            parts.append(f"For vocabulary, you scored {vocab_score} out of 100. Impressive range of words.")
        else:
            parts.append(f"For vocabulary, you scored {vocab_score} out of 100.")
            if jus:
                parts.append(jus[:140])

    # ── Fluency ──────────────────────────────────────────────────────────
    fluency_score = int(scores.get("fluency", 0))
    if fluency_score > 0:
        jus = (justifications.get("fluency") or "").strip()
        if fluency_score >= 80:
            parts.append(f"And for fluency, you scored {fluency_score} out of 100. You spoke very smoothly.")
        else:
            parts.append(f"And for fluency, you scored {fluency_score} out of 100.")
            if jus:
                parts.append(jus[:140])

    # ── Closing ──────────────────────────────────────────────────────────
    overall = pron_score or grammar_score or vocab_score or fluency_score
    parts.append(_closing(overall))

    return " ".join(parts)
