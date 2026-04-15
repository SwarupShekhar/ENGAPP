"""
Pronunciation-enhanced scoring: penalty-based deductions, fluency multiplier,
intelligibility weights, and hard CEFR caps.

Consumes flagged_errors from the detector and returns a structured score for
the assess endpoint and for the AI Tutor / Nest session summary.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# ── Per-error deduction points ────────────────────────────────────────
DEDUCTION_AZURE_MISPRONUNCIATION = 8   # Azure-confirmed Mispronunciation
DEDUCTION_GENERAL_MISPRONUNCIATION = 5  # Detector-flagged, not Azure-confirmed
DEDUCTION_PHONEME_SUBSTITUTION = 5      # Layer 2 phoneme edit distance catch
DEDUCTION_STT_CONFUSION = 4            # Layer 4 STT confusion pair
DEDUCTION_UNKNOWN = 3                  # Fallback for other categories

# Intelligibility weight per rule_category (multiplied with deduction)
HIGH_IMPACT = 1.5
MEDIUM_IMPACT = 1.0
LOW_IMPACT = 0.6

INTELLIGIBILITY_WEIGHT: dict[str, float] = {
    "w_to_v": HIGH_IMPACT,
    "v_to_w_reversal": HIGH_IMPACT,
    "th_to_t": HIGH_IMPACT,
    "th_to_d": HIGH_IMPACT,
    "zh_to_j": HIGH_IMPACT,
    "z_to_j": HIGH_IMPACT,
    "o_to_aa": MEDIUM_IMPACT,
    "ae_to_e": MEDIUM_IMPACT,
    "i_to_ee": MEDIUM_IMPACT,
    "h_dropping": MEDIUM_IMPACT,
    "general_mispronunciation": MEDIUM_IMPACT,
    "phoneme_substitution": MEDIUM_IMPACT,
    "r_rolling": LOW_IMPACT,
    "syllabic_lengthening": LOW_IMPACT,
    "schwa_addition": LOW_IMPACT,
    "schwa_reduction": LOW_IMPACT,
    "schwa_prothesis": LOW_IMPACT,
}

# Hard cap rules
CAP_W_V_OR_V_W_GE_2 = ("w_to_v or v_to_w_reversal >= 2 occurrences", 60, "B1")
CAP_TH_GE_3 = ("th_to_t or th_to_d >= 3 occurrences", 60, "B1")
CAP_4_PLUS_CATEGORIES = ("4+ distinct error categories in session", 45, "A2")
CAP_ANY_CATEGORY_GE_5 = ("any single category >= 5 occurrences", 45, "A2")


def _get_deduction(rule_category: str) -> float:
    """Base deduction points for a given rule category."""
    if rule_category == "general_mispronunciation":
        return DEDUCTION_GENERAL_MISPRONUNCIATION
    if rule_category == "phoneme_substitution":
        return DEDUCTION_PHONEME_SUBSTITUTION
    if rule_category in ("w_to_v", "v_to_w_reversal", "th_to_t", "th_to_d",
                         "zh_to_j", "z_to_j", "h_dropping", "ae_to_e",
                         "i_to_ee", "o_to_aa", "r_rolling"):
        return DEDUCTION_AZURE_MISPRONUNCIATION
    return DEDUCTION_UNKNOWN


def calculate_pronunciation_score(
    flagged_errors: list[dict],
    azure_word_accuracy_average: float = 100.0,
    *,
    fluency_score: float | None = None,
    prosody_score: float | None = None,
) -> dict[str, Any]:
    """
    Compute pronunciation score from flagged_errors with penalty-based deduction.

    Formula:
    1. Start at 100 (or Azure average if lower, as a ceiling)
    2. Subtract weighted penalties per flagged error
    3. Apply fluency multiplier: score × (0.7 + 0.3 × fluency/100)
    4. Blend with prosody: 0.56×score + 0.44×prosody_score when prosody is available
    5. Floor at 10, never return exactly 50 (that's the fallback sentinel)

    Returns:
        score: 0–100 float
        cefr_cap: "A2" | "B1" | null
        cap_reason: string explaining why cap triggered, or null
        category_breakdown: { "w_to_v": 2, "th_to_d": 1, ... }
        dominant_errors: top 3 categories by frequency
    """
    category_breakdown: dict[str, int] = {}
    for err in flagged_errors:
        cat = (err.get("rule_category") or "").strip()
        if not cat or cat == "unknown_substitution":
            continue
        category_breakdown[cat] = category_breakdown.get(cat, 0) + 1

    # Start from min(100, azure_average) — azure average acts as a ceiling
    base = min(100.0, max(0.0, float(azure_word_accuracy_average)))
    score = base

    # Apply per-error deductions weighted by intelligibility impact
    for err in flagged_errors:
        cat = (err.get("rule_category") or "").strip()
        if not cat or cat == "unknown_substitution":
            continue
        weight = INTELLIGIBILITY_WEIGHT.get(cat, MEDIUM_IMPACT)
        deduction = _get_deduction(cat)
        score -= deduction * weight

    # Fluency multiplier: poor fluency drags pronunciation down
    if fluency_score is not None and fluency_score < 100:
        fluency_mult = 0.7 + 0.3 * (fluency_score / 100.0)
        score = score * fluency_mult
        logger.info("Fluency multiplier: %.2f (fluency_score=%.1f)", fluency_mult, fluency_score)

    # Prosody blend: Azure word accuracy can stay high while stress/rhythm is weak.
    # Mixing ~45% toward ProsodyScore prevents inflated scores when only prosody is poor.
    if prosody_score is not None:
        before = score
        score = 0.56 * score + 0.44 * float(prosody_score)
        logger.info(
            "Prosody blend: %.1f -> %.1f (prosody_score=%.1f)",
            before,
            score,
            prosody_score,
        )

    score = max(10.0, min(100.0, round(score, 1)))

    # Never return exactly 50.0 — that's the "no data" sentinel
    if score == 50.0:
        score = 49.0

    # Hard caps
    caps: list[tuple[str, str, float]] = []
    w_v = category_breakdown.get("w_to_v", 0) + category_breakdown.get("v_to_w_reversal", 0)
    if w_v >= 2:
        caps.append((CAP_W_V_OR_V_W_GE_2[0], CAP_W_V_OR_V_W_GE_2[2], float(CAP_W_V_OR_V_W_GE_2[1])))
    th_total = category_breakdown.get("th_to_t", 0) + category_breakdown.get("th_to_d", 0)
    if th_total >= 3:
        caps.append((CAP_TH_GE_3[0], CAP_TH_GE_3[2], float(CAP_TH_GE_3[1])))
    if len(category_breakdown) >= 4:
        caps.append((CAP_4_PLUS_CATEGORIES[0], CAP_4_PLUS_CATEGORIES[2], float(CAP_4_PLUS_CATEGORIES[1])))
    if any(c >= 5 for c in category_breakdown.values()):
        caps.append((CAP_ANY_CATEGORY_GE_5[0], CAP_ANY_CATEGORY_GE_5[2], float(CAP_ANY_CATEGORY_GE_5[1])))

    cefr_cap: str | None = None
    cap_reason: str | None = None
    if caps:
        strictest = min(caps, key=lambda x: x[2])
        cap_reason = strictest[0]
        cefr_cap = strictest[1]
        score = min(score, strictest[2])

    # Dominant errors: top 3 by frequency
    sorted_cats = sorted(category_breakdown.items(), key=lambda x: -x[1])
    dominant_errors = [c[0] for c in sorted_cats[:3]]

    logger.info(
        "Pronunciation score: %.1f (base=%.1f, %d errors, fluency=%s, prosody=%s, cap=%s)",
        score, base, len(flagged_errors),
        f"{fluency_score:.1f}" if fluency_score is not None else "N/A",
        f"{prosody_score:.1f}" if prosody_score is not None else "N/A",
        cefr_cap or "none",
    )

    return {
        "score": score,
        "cefr_cap": cefr_cap,
        "cap_reason": cap_reason,
        "category_breakdown": category_breakdown,
        "dominant_errors": dominant_errors,
    }
