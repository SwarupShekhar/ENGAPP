"""
Shared error event schema for unified grammar + pronunciation error reporting.
Both grammar_analyzer and pronunciation_detector feed into this model via
service.py._build_unified_errors().
"""
from __future__ import annotations

from typing import Literal, Optional, TypedDict


class ErrorEvent(TypedDict, total=False):
    word: str
    error_type: Literal["grammar", "pronunciation", "both"]
    grammar_category: Optional[str]
    pronunciation_category: Optional[str]
    severity: Literal["high", "medium", "low"]
    confidence: float  # 0-1
    example: str       # context snippet


GRAMMAR_SEVERITY: dict[str, str] = {
    "tense_error": "high",
    "pluralization_error": "high",
    "word_order": "medium",
    "preposition_error": "medium",
    "article_missing": "low",
    "other_grammar": "medium",
}

# Intelligibility-weighted severity for Indian English pronunciation categories
PRONUNCIATION_SEVERITY: dict[str, str] = {
    "th_to_d": "high",
    "th_to_t": "high",
    "v_to_w": "high",
    "w_to_v": "high",
    "i_to_ee": "medium",
    "ae_to_e": "medium",
    "retroflex_substitution": "medium",
    "vowel_shift": "medium",
    "general_mispronunciation": "medium",
    "syllable_compression": "medium",
    "h_dropping": "low",
    "final_cluster_reduction": "low",
    "consonant_cluster_simplification": "low",
    "unknown_substitution": "low",
}

# Weights used for pronunciation score recalibration
PRONUNCIATION_WEIGHTS: dict[str, float] = {
    "th_to_d": 3.0,
    "th_to_t": 3.0,
    "v_to_w": 3.0,
    "w_to_v": 3.0,
    "i_to_ee": 2.0,
    "ae_to_e": 2.0,
    "retroflex_substitution": 2.0,
    "vowel_shift": 1.5,
    "general_mispronunciation": 1.5,
    "syllable_compression": 1.5,
    "h_dropping": 0.5,
    "final_cluster_reduction": 0.5,
    "consonant_cluster_simplification": 0.5,
    "unknown_substitution": 0.5,
}

_SEVERITY_RANK: dict[str, int] = {"high": 3, "medium": 2, "low": 1}


def severity_max(a: str, b: str) -> str:
    return a if _SEVERITY_RANK.get(a, 0) >= _SEVERITY_RANK.get(b, 0) else b


def sort_key(event: ErrorEvent) -> int:
    return -_SEVERITY_RANK.get(event.get("severity", "low"), 0)


def compute_weighted_pronunciation_score(flagged_errors: list[dict]) -> float:
    """
    Recalibrated pronunciation score using intelligibility-weighted error counts.
    Returns 0-100. Replaces raw-count-based scoring to break 35-45 compression.
    """
    if not flagged_errors:
        return 100.0

    total_words = max(len(flagged_errors), 1)
    weighted_sum = sum(
        PRONUNCIATION_WEIGHTS.get(e.get("rule_category", ""), 1.0)
        for e in flagged_errors
    )
    density = weighted_sum / total_words

    if density <= 0.5:
        score = 100 - density * 20
    elif density <= 1.5:
        score = 90 - (density - 0.5) * 25
    elif density <= 3.0:
        score = 65 - (density - 1.5) * 20
    else:
        score = max(5.0, 35 - (density - 3.0) * 5)

    return round(max(0.0, min(100.0, score)), 1)
