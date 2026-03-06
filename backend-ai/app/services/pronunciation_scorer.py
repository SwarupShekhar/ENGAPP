"""
Pronunciation-enhanced scoring: pattern penalties, intelligibility weights, and hard CEFR caps.
Consumes flagged_errors from the detector and returns a structured score for the assess endpoint
and for the AI Tutor / Nest session summary.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# Pattern penalty (per category, by occurrence count)
# 1 occurrence → 8 pts, 2 → 15 pts, 3+ → 22 pts (capped per category)
PATTERN_PENALTY_TABLE = {
    1: 8,
    2: 15,
    3: 22,  # 3+ use this (capped per category)
}

# Intelligibility weight per rule_category (how much each error blocks understanding)
HIGH_IMPACT = 1.5
MEDIUM_IMPACT = 1.0
LOW_IMPACT = 0.6

INTELLIGIBILITY_WEIGHT: dict[str, float] = {
    # High impact
    "w_to_v": HIGH_IMPACT,
    "v_to_w_reversal": HIGH_IMPACT,
    "th_to_t": HIGH_IMPACT,
    "th_to_d": HIGH_IMPACT,
    "zh_to_j": HIGH_IMPACT,
    "z_to_j": HIGH_IMPACT,
    # Medium impact
    "o_to_aa": MEDIUM_IMPACT,
    "ae_to_e": MEDIUM_IMPACT,
    "i_to_ee": MEDIUM_IMPACT,
    "h_dropping": MEDIUM_IMPACT,
    # Low impact
    "r_rolling": LOW_IMPACT,
    "syllabic_lengthening": LOW_IMPACT,
    "schwa_addition": LOW_IMPACT,
    "schwa_reduction": LOW_IMPACT,
    "schwa_prothesis": LOW_IMPACT,
}

# Hard cap rules (evaluated after score calculation)
# Format: (condition description, cap_score, cap_cefr)
CAP_W_V_OR_V_W_GE_2 = ("w_to_v or v_to_w_reversal >= 2 occurrences", 60, "B1")
CAP_TH_GE_3 = ("th_to_t or th_to_d >= 3 occurrences", 60, "B1")
CAP_4_PLUS_CATEGORIES = ("4+ distinct error categories in session", 45, "A2")
CAP_ANY_CATEGORY_GE_5 = ("any single category >= 5 occurrences", 45, "A2")


def calculate_pronunciation_score(
    flagged_errors: list[dict],
    azure_word_accuracy_average: float = 100.0,
) -> dict[str, Any]:
    """
    Compute pronunciation score from flagged_errors and Azure word-accuracy baseline.

    Returns:
        score: 0–100 float
        cefr_cap: "A2" | "B1" | null
        cap_reason: string explaining why cap triggered, or null
        category_breakdown: { "w_to_v": 2, "th_to_d": 1, ... }
        dominant_errors: top 3 categories by frequency (for motivational feedback)
    """
    category_breakdown: dict[str, int] = {}
    for err in flagged_errors:
        cat = (err.get("rule_category") or "").strip()
        if not cat or cat == "unknown_substitution":
            continue
        category_breakdown[cat] = category_breakdown.get(cat, 0) + 1

    # Start from Azure average (0–100)
    score = max(0.0, min(100.0, float(azure_word_accuracy_average)))

    # Apply pattern penalties per category (1→8, 2→15, 3+→22), weighted by intelligibility
    for cat, count in category_breakdown.items():
        weight = INTELLIGILITY_WEIGHT.get(cat, MEDIUM_IMPACT)
        if count >= 3:
            penalty = PATTERN_PENALTY_TABLE[3] * weight
        elif count == 2:
            penalty = PATTERN_PENALTY_TABLE[2] * weight
        else:
            penalty = PATTERN_PENALTY_TABLE[1] * weight
        score -= penalty

    score = max(0.0, min(100.0, round(score, 1)))

    # Hard caps (evaluated after score calculation); apply strictest (lowest) cap when multiple trigger
    caps: list[tuple[str, str, float]] = []  # (reason, cefr, score)
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

    # Dominant errors: top 3 by frequency (for motivational feedback)
    sorted_cats = sorted(
        category_breakdown.items(),
        key=lambda x: -x[1],
    )
    dominant_errors = [c[0] for c in sorted_cats[:3]]

    return {
        "score": score,
        "cefr_cap": cefr_cap,
        "cap_reason": cap_reason,
        "category_breakdown": category_breakdown,
        "dominant_errors": dominant_errors,
    }
