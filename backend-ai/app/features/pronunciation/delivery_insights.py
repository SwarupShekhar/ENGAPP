"""
Rule-based delivery coaching insights from librosa features (+ optional WPM).
Assessment-only, insights-only — does not change scores.
"""
from __future__ import annotations

from typing import Any, Literal

from app.features.pronunciation.librosa_features import compute_delivery_confidence

InsightId = Literal["expressiveness", "pauses", "energy", "hesitation", "pace"]
Severity = Literal["info", "tip", "focus"]

# Thresholds (v1 — calibrate on internal clips before enabling flag for testers)
PITCH_LOW = 25.0
PITCH_GOOD = 30.0
PAUSE_HIGH = 0.35
PAUSE_GOOD = 0.25
ENERGY_LOW = 30.0
ENERGY_GOOD = 40.0
DELIVERY_CONFIDENCE_LOW = 45.0
WPM_IDEAL_MIN = 130.0
WPM_IDEAL_MAX = 170.0
WPM_SLOW = 100.0
WPM_FAST = 180.0

PROBLEM_PRIORITY: list[InsightId] = [
    "pauses",
    "expressiveness",
    "hesitation",
    "energy",
    "pace",
]


def _problem_candidates(
    features: dict[str, float],
    wpm: float | None,
) -> list[dict[str, Any]]:
    pitch = features.get("pitch_variance", 0.0)
    pause_ratio = features.get("pause_ratio", 0.0)
    energy = features.get("energy_level", 0.0)
    delivery_confidence = compute_delivery_confidence(pitch, pause_ratio)

    candidates: list[dict[str, Any]] = []

    if pause_ratio > PAUSE_HIGH:
        pct = int(round(pause_ratio * 100))
        candidates.append(
            {
                "id": "pauses",
                "label": "Pauses",
                "severity": "focus",
                "message": (
                    f"About {pct}% of your answer was silence — try shorter gaps between phrases."
                ),
                "feature_value": pause_ratio,
                "priority": 0,
            }
        )

    if pitch < PITCH_LOW:
        candidates.append(
            {
                "id": "expressiveness",
                "label": "Expressiveness",
                "severity": "tip",
                "message": (
                    "Your pitch varied little — try emphasizing key words with a slight rise or fall."
                ),
                "feature_value": pitch,
                "priority": 1,
            }
        )

    if delivery_confidence < DELIVERY_CONFIDENCE_LOW:
        candidates.append(
            {
                "id": "hesitation",
                "label": "Flow",
                "severity": "tip",
                "message": (
                    "Your delivery had long gaps and flat pitch — take a breath, then speak in one steady flow."
                ),
                "feature_value": delivery_confidence,
                "priority": 2,
            }
        )

    if energy < ENERGY_LOW:
        candidates.append(
            {
                "id": "energy",
                "label": "Energy",
                "severity": "tip",
                "message": (
                    "Volume was on the quiet side — speaking a bit louder helps you sound clearer and more confident."
                ),
                "feature_value": energy,
                "priority": 3,
            }
        )

    if wpm is not None and wpm > 0:
        if wpm < WPM_SLOW:
            candidates.append(
                {
                    "id": "pace",
                    "label": "Pace",
                    "severity": "tip",
                    "message": (
                        f"You spoke at about {int(round(wpm))} WPM — try picking up the pace slightly toward 130–170."
                    ),
                    "feature_value": wpm,
                    "priority": 4,
                }
            )
        elif wpm > WPM_FAST:
            candidates.append(
                {
                    "id": "pace",
                    "label": "Pace",
                    "severity": "tip",
                    "message": (
                        f"You spoke at about {int(round(wpm))} WPM — slow down a little so each word lands clearly."
                    ),
                    "feature_value": wpm,
                    "priority": 4,
                }
            )

    return candidates


def _affirming_candidates(
    features: dict[str, float],
    wpm: float | None,
) -> list[dict[str, Any]]:
    pitch = features.get("pitch_variance", 0.0)
    pause_ratio = features.get("pause_ratio", 0.0)
    energy = features.get("energy_level", 0.0)
    affirming: list[dict[str, Any]] = []

    if wpm is not None and WPM_IDEAL_MIN <= wpm <= WPM_IDEAL_MAX:
        affirming.append(
            {
                "id": "pace",
                "label": "Pace",
                "severity": "info",
                "message": (
                    f"You spoke at about {int(round(wpm))} WPM — right in the natural range. Nice steady pace."
                ),
                "feature_value": wpm,
                "strength": wpm - WPM_IDEAL_MIN,
            }
        )

    if pitch >= PITCH_GOOD:
        affirming.append(
            {
                "id": "expressiveness",
                "label": "Expressiveness",
                "severity": "info",
                "message": "Good pitch variation — your delivery sounded lively and engaged.",
                "feature_value": pitch,
                "strength": pitch - PITCH_GOOD,
            }
        )

    if pause_ratio <= PAUSE_GOOD:
        affirming.append(
            {
                "id": "pauses",
                "label": "Pauses",
                "severity": "info",
                "message": "You kept pauses short — your answer flowed well without long silences.",
                "feature_value": pause_ratio,
                "strength": PAUSE_GOOD - pause_ratio,
            }
        )

    if energy >= ENERGY_GOOD:
        affirming.append(
            {
                "id": "energy",
                "label": "Energy",
                "severity": "info",
                "message": "Strong, clear volume — easy to follow.",
                "feature_value": energy,
                "strength": energy - ENERGY_GOOD,
            }
        )

    delivery_confidence = compute_delivery_confidence(pitch, pause_ratio)
    if delivery_confidence >= 60.0 and not any(a["id"] == "hesitation" for a in affirming):
        affirming.append(
            {
                "id": "hesitation",
                "label": "Flow",
                "severity": "info",
                "message": "Smooth, steady delivery — you sounded comfortable speaking.",
                "feature_value": delivery_confidence,
                "strength": delivery_confidence - 60.0,
            }
        )

    affirming.sort(key=lambda x: float(x.get("strength", 0)), reverse=True)
    return affirming


def build_delivery_insights(
    features: dict[str, float],
    wpm: float | None = None,
) -> list[dict[str, Any]]:
    """
    Select 2–4 bullets:
    - Problem priority: pauses > expressiveness > hesitation > energy > pace
    - Max 3 problems; if ≥3 problems fire, show 2 problems + 1 affirming
    - Always include ≥1 affirming when any good metric exists OR when zero problems
    - Min 1 bullet when features are valid
    """
    if not features or features.get("duration_sec", 0) <= 0:
        return []

    problems = _problem_candidates(features, wpm)
    problems.sort(key=lambda x: x["priority"])

    affirming = _affirming_candidates(features, wpm)

    selected: list[dict[str, Any]] = []
    has_affirming = False

    if len(problems) >= 3:
        selected.extend(problems[:2])
        if affirming:
            selected.append(affirming[0])
            has_affirming = True
    elif problems:
        selected.extend(problems[:3])
    else:
        selected.extend(affirming[:3])
        has_affirming = len(selected) > 0

    if problems and not has_affirming and affirming:
        if len(selected) >= 4:
            selected = selected[:3]
        selected.append(affirming[0])
        has_affirming = True

    if not selected and affirming:
        selected.append(affirming[0])

    if not selected:
        selected.append(
            {
                "id": "pace",
                "label": "Delivery",
                "severity": "info",
                "message": "We heard you clearly — keep practicing to refine your delivery.",
                "feature_value": wpm,
            }
        )

    # Cap at 4, ensure at least 2 when we have both problem and affirming data
    selected = selected[:4]
    if len(selected) < 2 and affirming:
        seen = {i["id"] for i in selected}
        for a in affirming:
            if a["id"] not in seen and len(selected) < 2:
                selected.append(a)
                seen.add(a["id"])

    return [_public_insight(i) for i in selected[:4]]


def _public_insight(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": raw["id"],
        "label": raw["label"],
        "severity": raw["severity"],
        "message": raw["message"],
        "feature_value": raw.get("feature_value"),
    }
