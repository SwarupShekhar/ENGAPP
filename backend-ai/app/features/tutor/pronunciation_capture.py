"""
Accumulate pronunciation issues during live tutor WebSocket sessions.
Post-call /analyze pops them by session_id and merges with optional body payload.
"""
from __future__ import annotations

import logging
import re
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)

from app.phoneme_loader import get_phoneme_map

_PRON_TAG = re.compile(
    r'\[PRON:\s*heard="([^"]+)"\s+correct="([^"]+)"\s+rule="([^"]*)"\s*\]',
    re.IGNORECASE,
)
# Strip incomplete tail so partial streaming chunks do not leak `[PRON:...` to the client
_PRON_PARTIAL_TAIL = re.compile(r"\[PRON:\s*[^\]]*$", re.IGNORECASE)

_LOCK = Lock()
_SESSION_PRONUNCIATION_ISSUES: dict[str, list[dict[str, Any]]] = {}

_SEVERITY_RANK = {"high": 3, "medium": 2, "low": 1}


def append_pronunciation_issues(session_id: str, items: list[dict[str, Any]]) -> None:
    if not session_id or not items:
        return
    with _LOCK:
        bucket = _SESSION_PRONUNCIATION_ISSUES.setdefault(session_id, [])
        bucket.extend(items)


def extend_from_body_and_pop_store(
    session_id: str,
    body_issues: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Merge optional request body issues with WebSocket-accumulated issues (store is popped once)."""
    out: list[dict[str, Any]] = []
    if body_issues:
        out.extend(body_issues)
    with _LOCK:
        stored = _SESSION_PRONUNCIATION_ISSUES.pop(session_id, [])
    out.extend(stored)
    return out


def session_captured_issue_count(session_id: str) -> int:
    with _LOCK:
        return len(_SESSION_PRONUNCIATION_ISSUES.get(session_id, []))


def _severity_from_confidence(conf: float) -> str:
    if conf < 0.50:
        return "high"
    if conf < 0.75:
        return "medium"
    return "low"


def _default_suggestion(rule_category: str, correct: str, heard: str) -> str:
    rc = (rule_category or "general").replace("_", " ")
    return f"Practice '{correct}' (heard as '{heard}') — pattern: {rc}."


def strip_pron_tags_for_mobile(text: str) -> str:
    """Remove complete PRON tags and any incomplete `[PRON:` suffix (streaming-safe)."""
    if not text:
        return text
    t = _PRON_TAG.sub("", text)
    partial = _PRON_PARTIAL_TAIL.search(t)
    if partial:
        t = t[: partial.start()].rstrip()
    return t.strip()


def extract_structured_tags(gemini_response: str) -> tuple[list[dict[str, Any]], str]:
    """
    Parse [PRON: heard="..." correct="..." rule="..."] from the full model output.
    Returns (issues, cleaned_text_without_tags).
    """
    if not gemini_response or not gemini_response.strip():
        return [], gemini_response or ""

    pmap = get_phoneme_map()
    by_app = pmap.get("by_approximation") or {}
    if not isinstance(by_app, dict):
        by_app = {}

    out: list[dict[str, Any]] = []
    for m in _PRON_TAG.finditer(gemini_response):
        heard = (m.group(1) or "").strip().lower()
        correct = (m.group(2) or "").strip()
        rule = (m.group(3) or "").strip() or "gemini_tagged"
        if len(correct) < 1 or not heard:
            continue
        entry = by_app.get(heard) if isinstance(by_app.get(heard), dict) else {}
        tip = entry.get("tip") if isinstance(entry, dict) else None
        if not tip:
            tip = f"Practice '{correct}' — avoid saying '{heard}'."
        out.append(
            {
                "word": correct,
                "heard": heard,
                "issueType": "mispronunciation",
                "severity": "medium",
                "suggestion": str(tip),
                "confidence": 0.92,
                "rule_category": rule,
            }
        )
    cleaned = strip_pron_tags_for_mobile(gemini_response)
    return out, cleaned


def _phonetic_insights_dict(phonetic_context: dict[str, Any] | None) -> dict[str, Any]:
    """Unwrap optional { phonetic_insights: {...}, reference_text, ... } from client."""
    if not phonetic_context:
        return {}
    if "phonetic_insights" in phonetic_context and isinstance(
        phonetic_context.get("phonetic_insights"), dict
    ):
        return phonetic_context.get("phonetic_insights") or {}
    return phonetic_context


def issues_from_phonetic_context(
    phonetic_context: dict[str, Any] | None,
    reference_fallback: str = "",
) -> list[dict[str, Any]]:
    """
    Layer A: Azure dual-pass / merged insights.
    critical_errors / minor_errors use ``word`` as the CORRECT surface (reference alignment),
    not what the user said — ``heard`` is resolved via ``by_correct_word`` (approximation key).
    indian_english_patterns may supply ``detected_as`` as the mispronounced form.

    Also handles the free-speech phonetic_context shape: a ``words`` list of raw Azure
    word entries with AccuracyScore / ErrorType / Phonemes. Any word with AccuracyScore < 70
    or an explicit Mispronunciation/Insertion/Omission ErrorType is flagged, and the phoneme
    breakdown is included so the feedback UI can show which phoneme was wrong.
    """
    if not phonetic_context:
        return []

    outer_ref = phonetic_context.get("reference_text")
    raw_words: list[dict[str, Any]] = phonetic_context.get("words") or []
    insights = _phonetic_insights_dict(phonetic_context)
    if not insights and not outer_ref and not raw_words:
        return []

    pmap = get_phoneme_map()
    by_correct = pmap.get("by_correct_word") or {}
    if not isinstance(by_correct, dict):
        by_correct = {}

    out: list[dict[str, Any]] = []

    def process_error(word: str, score: float, severity: str) -> None:
        correct = word.lower().strip()
        if not correct:
            return
        raw = by_correct.get(correct)
        entry = raw if isinstance(raw, dict) else {}
        approx = entry.get("indian_spelling_approximation") or entry.get("approximation")
        heard_l = str(approx).lower().strip() if approx else ""
        heard = heard_l or correct
        rule = str(entry.get("rule_category") or "phoneme_score")
        tip = str(
            entry.get("tip")
            or _default_suggestion(rule, correct, heard)
        )
        conf = max(0.0, min(1.0, 1.0 - (float(score) / 100.0)))
        out.append(
            {
                "word": correct,
                "heard": heard,
                "issueType": "mispronunciation",
                "severity": severity,
                "suggestion": tip,
                "confidence": round(conf, 2),
                "rule_category": rule,
            }
        )

    # --- Raw words from free-speech Azure PA (AccuracyScore < 70 check) ---
    # In free-speech mode Azure sets genuine AccuracyScores instead of inflated
    # self-reference scores. Flag any word below threshold regardless of ErrorType.
    _ACCURACY_THRESHOLD = 70
    for rw in raw_words:
        rw_word = (rw.get("Word") or "").strip().lower()
        if not rw_word:
            continue
        rw_acc = float(rw.get("AccuracyScore") or 100)
        rw_err = (rw.get("ErrorType") or "None").strip()
        if rw_acc >= _ACCURACY_THRESHOLD and rw_err not in ("Mispronunciation", "Omission", "Insertion"):
            continue
        # Resolve correct word and rule from phoneme map
        raw = by_correct.get(rw_word)
        entry = raw if isinstance(raw, dict) else {}
        approx = entry.get("indian_spelling_approximation") or entry.get("approximation")
        heard_l = str(approx).lower().strip() if approx else rw_word
        rule = str(entry.get("rule_category") or "phoneme_score")
        tip = str(entry.get("tip") or _default_suggestion(rule, rw_word, heard_l))
        conf = max(0.0, min(1.0, 1.0 - (rw_acc / 100.0)))
        severity = "high" if rw_acc < 50 else "medium"
        # Include worst phoneme info so feedback UI can show which phoneme failed
        phonemes = rw.get("Phonemes") or []
        worst_phoneme = ""
        worst_score = 100.0
        for ph in phonemes:
            ph_pa = ph.get("PronunciationAssessment") or {}
            ph_score = ph_pa.get("AccuracyScore")
            if ph_score is None:
                ph_score = ph.get("AccuracyScore")
            if ph_score is not None and float(ph_score) < worst_score:
                worst_score = float(ph_score)
                worst_phoneme = ph.get("Phoneme") or ""
        issue: dict[str, Any] = {
            "word": rw_word,
            "heard": heard_l,
            "issueType": "mispronunciation",
            "severity": severity,
            "suggestion": tip,
            "confidence": round(conf, 2),
            "rule_category": rule,
        }
        if worst_phoneme:
            issue["worst_phoneme"] = worst_phoneme
            issue["worst_phoneme_score"] = round(worst_score, 1)
        out.append(issue)

    for e in insights.get("critical_errors") or []:
        if not isinstance(e, dict):
            continue
        w = e.get("word", "")
        if not w:
            continue
        process_error(
            str(w),
            float(e.get("score", e.get("accuracy_score", 0)) or 0),
            "high",
        )

    for e in insights.get("minor_errors") or []:
        if not isinstance(e, dict):
            continue
        w = e.get("word", "")
        if not w:
            continue
        process_error(
            str(w),
            float(e.get("score", e.get("accuracy_score", 0)) or 0),
            "medium",
        )

    for p in insights.get("indian_english_patterns") or []:
        if not isinstance(p, dict):
            continue
        correct = (p.get("word") or "").lower().strip()
        if not correct:
            continue
        heard = (p.get("detected_as") or correct).lower().strip()
        rule = str(p.get("pattern_name") or "indian_english")
        hint = str(p.get("hint") or f"Practice '{correct}'")
        out.append(
            {
                "word": correct,
                "heard": heard,
                "issueType": "mispronunciation",
                "severity": "medium",
                "suggestion": hint,
                "confidence": 0.85,
                "rule_category": rule,
            }
        )

    return out


def extract_pronunciation_corrections(gemini_response_text: str) -> list[dict[str, Any]]:
    """
    Heuristic extraction of explicit pronunciation corrections from tutor text.
    Tuned for Maya-style 1–2 sentence replies.
    """
    if not gemini_response_text or not gemini_response_text.strip():
        return []

    text = gemini_response_text.strip()
    found: list[dict[str, Any]] = []
    lower = text.lower()

    patterns: list[tuple[re.Pattern[str], str]] = [
        (
            re.compile(
                r"it['']?s\s+pronounced\s+[\"']([^\"']+)[\"']",
                re.IGNORECASE,
            ),
            "other",
        ),
        (
            re.compile(
                r"the\s+correct\s+pronunciation\s+is\s+[\"']?([^\n\"'.!?]+)[\"']?",
                re.IGNORECASE,
            ),
            "other",
        ),
        (
            re.compile(
                r"try\s+saying\s+[\"']([^\"']+)[\"']",
                re.IGNORECASE,
            ),
            "other",
        ),
        (
            re.compile(
                r"say\s+[\"']([^\"']+)[\"']\s*,?\s*not\s+[\"']([^\"']+)[\"']",
                re.IGNORECASE,
            ),
            "say_not",
        ),
        (
            re.compile(
                r"[\"']([^\"']+)[\"']\s+not\s+[\"']([^\"']+)[\"']",
                re.IGNORECASE,
            ),
            "quoted_not",
        ),
    ]

    for rx, kind in patterns:
        for m in rx.finditer(text):
            groups = m.groups()
            if kind in ("say_not", "quoted_not"):
                correct = (groups[0] or "").strip()
                heard = (groups[1] or "").strip()
            else:
                correct = (groups[0] or "").strip()
                heard = ""
            if len(correct) < 2:
                continue
            conf = 0.88 if "pronounced" in lower or "correct pronunciation" in lower else 0.80
            sev = _severity_from_confidence(conf)
            found.append(
                {
                    "word": correct,
                    "heard": heard or correct,
                    "issueType": "substitution",
                    "severity": sev,
                    "suggestion": _default_suggestion("tutor_correction", correct, heard or "?"),
                    "confidence": conf,
                    "rule_category": "tutor_inline_correction",
                }
            )

    return found


def issues_from_transcript_approximation(transcript: str) -> list[dict[str, Any]]:
    """Cross-reference STT words with phoneme map by_approximation (silent misses)."""
    if not transcript or not transcript.strip():
        return []

    pmap = get_phoneme_map()
    by_app = pmap.get("by_approximation") or {}
    if not isinstance(by_app, dict):
        return []

    out: list[dict[str, Any]] = []
    for raw in re.findall(r"[A-Za-z']+", transcript):
        w = raw.lower().strip("'")
        if len(w) < 2 or w not in by_app:
            continue
        entry = by_app[w]
        if not isinstance(entry, dict):
            continue
        correct = str(entry.get("correct_word") or "").strip() or w
        rule = str(entry.get("rule_category") or "approximation")
        conf = 0.72
        sev = _severity_from_confidence(conf)
        out.append(
            {
                "word": correct,
                "heard": w,
                "issueType": "substitution",
                "severity": sev,
                "suggestion": _default_suggestion(rule, correct, w),
                "confidence": conf,
                "rule_category": rule,
            }
        )
    return out


def merge_issue_batches(issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate by target word (case-insensitive); keep highest severity; enrich heard/suggestion."""
    by_word: dict[str, dict[str, Any]] = {}
    for it in issues:
        w = (it.get("word") or "").strip().lower()
        if not w:
            continue
        sev = str(it.get("severity") or "medium").lower()
        if sev not in _SEVERITY_RANK:
            sev = "medium"
        cur = by_word.get(w)
        if cur is None:
            by_word[w] = {**it, "word": it.get("word") or w, "severity": sev}
            continue
        cur_sev = str(cur.get("severity") or "medium").lower()
        if cur_sev not in _SEVERITY_RANK:
            cur_sev = "medium"
        if _SEVERITY_RANK[sev] > _SEVERITY_RANK[cur_sev]:
            by_word[w] = {**it, "word": it.get("word") or w, "severity": sev}
        elif _SEVERITY_RANK[sev] == _SEVERITY_RANK[cur_sev]:
            merged = {**cur}
            if not str(cur.get("heard") or "").strip() and str(it.get("heard") or "").strip():
                merged["heard"] = it.get("heard")
            if len(str(it.get("suggestion") or "")) > len(str(cur.get("suggestion") or "")):
                merged["suggestion"] = it.get("suggestion")
            rc = it.get("rule_category") or ""
            if rc and rc != "tutor_inline_correction":
                merged["rule_category"] = rc
            by_word[w] = merged
    return list(by_word.values())


def build_turn_capture(
    gemini_full_response: str,
    user_transcript: str,
    phonetic_context: dict[str, Any] | None = None,
    conversation_history: list[Any] | None = None,
) -> list[dict[str, Any]]:
    """
    One WebSocket turn: Azure insights → Gemini PRON tags → phrase regexes → STT token map.
    conversation_history is reserved for future context; unused for now.
    """
    _ = conversation_history
    pc = phonetic_context or {}
    a = issues_from_phonetic_context(pc, reference_fallback=(user_transcript or "").strip())
    b, _ = extract_structured_tags(gemini_full_response)
    c = extract_pronunciation_corrections(gemini_full_response)
    d = issues_from_transcript_approximation(user_transcript)
    # Layer D also runs on RAW spoken words from Azure (pre-normalization).
    # This catches "vater", "tink", "englis" that STT normalized away in the transcript.
    _raw_ws = [w.get("Word", "") for w in (pc.get("words") or []) if w.get("Word")]
    d_raw = issues_from_transcript_approximation(" ".join(_raw_ws)) if _raw_ws else []
    merged = merge_issue_batches(a + b + c + d + d_raw)
    try:
        logger.info(
            "[Pulse] capture layers — phonetic_ctx=%s structured_tags=%s gemini_patterns=%s phoneme_lookup=%s → merged=%s",
            len(a),
            len(b),
            len(c),
            len(d),
            len(merged),
        )
        print(
            f"[Pulse] capture layers — phonetic_ctx={len(a)} structured_tags={len(b)} "
            f"gemini_patterns={len(c)} phoneme_lookup={len(d)} → merged={len(merged)}",
            flush=True,
        )
    except Exception:
        pass
    return merged
