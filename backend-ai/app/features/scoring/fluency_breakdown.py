"""
Shared fluency metrics: WPM, filler words, and FluencyRecalibrator breakdown.
Used by pronunciation assess and CQS scoring paths.
"""
from __future__ import annotations

import re
from typing import Any

from app.assessment.scoring.fluency_recalibrator import FluencyRecalibrator

FILLER_WORDS = [
    "um",
    "uh",
    "er",
    "ah",
    "like",
    "you know",
    "basically",
    "actually",
    "literally",
    "sort of",
    "kind of",
]

_recalibrator = FluencyRecalibrator()


def count_fillers(text: str) -> tuple[int, list[str]]:
    """Count filler occurrences and return top fillers by frequency."""
    if not text:
        return 0, []
    lowered = text.lower()
    counts: dict[str, int] = {}
    for filler in FILLER_WORDS:
        pattern = re.compile(rf"\b{re.escape(filler)}\b")
        matches = pattern.findall(lowered)
        if matches:
            counts[filler] = counts.get(filler, 0) + len(matches)
    total = sum(counts.values())
    top = sorted(counts.keys(), key=lambda k: counts[k], reverse=True)[:5]
    return total, top


def _extract_words_from_result(azure_result: dict[str, Any]) -> list[dict[str, Any]]:
    words: list[dict[str, Any]] = []
    nbests = (
        azure_result.get("NBest")
        or azure_result.get("Nbests")
        or azure_result.get("nbest")
    )
    if nbests and isinstance(nbests, list) and nbests:
        first = nbests[0]
        if isinstance(first, dict):
            words = first.get("Words") or first.get("words") or []
    if not words:
        words = azure_result.get("Words") or azure_result.get("words") or []
    return words or []


def extract_word_timing(azure_result: dict[str, Any]) -> dict[str, Any]:
    """Extract word durations (ms) and mid-phrase pause counts from Azure JSON."""
    durations: list[float] = []
    pauses: list[float] = []
    mid_phrase_count = 0

    words = _extract_words_from_result(azure_result)
    for i, word in enumerate(words):
        dur = float(word.get("Duration", 0) or 0) / 10000.0
        if dur > 0:
            durations.append(dur)
        if i < len(words) - 1:
            next_word = words[i + 1]
            offset = word.get("Offset")
            duration = word.get("Duration")
            next_offset = next_word.get("Offset")
            if offset is not None and duration is not None and next_offset is not None:
                gap = (float(next_offset) - (float(offset) + float(duration))) / 10000.0
                if gap > 200:
                    pauses.append(gap)
                    mid_phrase_count += 1

    return {
        "word_durations": durations,
        "pause_data": {"mid_phrase_count": mid_phrase_count, "pauses": pauses},
    }


def compute_wpm(azure_result: dict[str, Any], transcript: str) -> float:
    """Words per minute from Azure word timings, else transcript word-count estimate."""
    words = _extract_words_from_result(azure_result)
    if not words:
        wc = len(re.findall(r"\b[a-zA-Z]+\b", transcript or ""))
        return float(wc) if wc > 0 else 0.0

    timed = [w for w in words if w.get("Offset") is not None and w.get("Duration") is not None]
    if timed:
        first_offset = float(timed[0]["Offset"])
        last = timed[-1]
        last_end = float(last["Offset"]) + float(last["Duration"])
        span_ms = max(last_end - first_offset, 1.0) / 10000.0
        span_min = span_ms / 60000.0
        if span_min > 0:
            return round(len(words) / span_min, 1)

    wc = len(words)
    return float(wc)


def _merge_utterances(utterances: list[dict[str, Any]]) -> dict[str, Any]:
    """Flatten multiple Azure utterance dicts into one pseudo-result for timing."""
    all_words: list[dict[str, Any]] = []
    fluency_scores: list[float] = []
    prosody_scores: list[float] = []
    display_parts: list[str] = []

    for utt in utterances:
        if not isinstance(utt, dict):
            continue
        nbests = utt.get("NBest") or utt.get("Nbests") or utt.get("nbest") or [utt]
        if not nbests:
            continue
        first = nbests[0] if isinstance(nbests[0], dict) else {}
        all_words.extend(first.get("Words") or first.get("words") or [])
        pa = first.get("PronunciationAssessment") or {}
        if "FluencyScore" in pa:
            fluency_scores.append(float(pa["FluencyScore"]))
        elif utt.get("fluency_score") is not None:
            fluency_scores.append(float(utt["fluency_score"]))
        if "ProsodyScore" in pa:
            prosody_scores.append(float(pa["ProsodyScore"]))
        elif utt.get("prosody_score") is not None:
            prosody_scores.append(float(utt["prosody_score"]))
        disp = first.get("Display") or first.get("Lexical") or ""
        if disp:
            display_parts.append(str(disp))

    merged: dict[str, Any] = {
        "NBest": [{"Words": all_words, "Display": " ".join(display_parts)}],
    }
    if fluency_scores:
        merged["fluency_score"] = sum(fluency_scores) / len(fluency_scores)
    if prosody_scores:
        merged["prosody_score"] = sum(prosody_scores) / len(prosody_scores)
    return merged


def build_fluency_breakdown(
    azure_data: dict[str, Any] | list[dict[str, Any]],
    transcript: str,
) -> dict[str, Any]:
    """
    Build unified fluency breakdown dict for API consumers.
    azure_data: single Azure PA result or list of utterance results (CQS).
    """
    if isinstance(azure_data, list):
        azure_result = _merge_utterances(azure_data) if azure_data else {}
    else:
        azure_result = azure_data or {}

    words = _extract_words_from_result(azure_result)
    if not transcript and words:
        transcript = " ".join(
            w.get("Word") or w.get("word") or "" for w in words
        ).strip()

    filler_count, top_fillers = count_fillers(transcript)
    timing = extract_word_timing(azure_result)
    wpm = compute_wpm(azure_result, transcript)

    nbest0 = (azure_result.get("NBest") or azure_result.get("Nbests") or [{}])[0]
    if not isinstance(nbest0, dict):
        nbest0 = {}

    azure_fluency = float(
        azure_result.get("fluency_score")
        or (nbest0.get("PronunciationAssessment") or {}).get("FluencyScore")
        or 0
    )
    azure_prosody = float(
        azure_result.get("prosody_score")
        or (nbest0.get("PronunciationAssessment") or {}).get("ProsodyScore")
        or azure_fluency
    )

    recalibrated = _recalibrator.recalibrate_fluency(
        azure_fluency,
        azure_prosody,
        wpm,
        timing["pause_data"],
        timing["word_durations"],
        nbest0,
        transcript or nbest0.get("Display", ""),
    )

    components = recalibrated["components"]
    pace = components["pace_control"]

    return {
        "speech_flow": components["speech_flow"],
        "connected_speech": components["connected_speech"],
        "naturalness": components["connected_speech"],
        "prosody": components["prosody"],
        "pace_control": pace,
        "paceScore": pace,
        "wpm": wpm,
        "fillerCount": filler_count,
        "topFillers": top_fillers,
        "components": components,
        "connected_speech_details": recalibrated.get("connected_speech_details"),
        "examples": recalibrated.get("examples"),
        "overall_fluency": recalibrated["overall_fluency"],
        "azure_raw_fluency": recalibrated["azure_raw"]["fluency"],
        "azure_raw_prosody": recalibrated["azure_raw"]["prosody"],
        "pause_count": timing["pause_data"].get("mid_phrase_count", 0),
    }


def hesitation_markers_from_breakdown(breakdown: dict[str, Any]) -> dict[str, Any]:
    """Unified hesitationMarkers shape for Nest Analysis / home skills."""
    return {
        "filler_words_count": breakdown.get("fillerCount", 0),
        "pauses_count": breakdown.get("pause_count", 0),
        "top_fillers": breakdown.get("topFillers", []),
        "wpm": breakdown.get("wpm", 0),
    }
