"""
Three-trigger hint engine for in-call coaching.

Priority: mistake_recurrence > missed_opportunity > periodic_nudge
Throttle: 30s warmup, 90s gap, max 3 per call.
"""
from __future__ import annotations
import logging
import re
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

WARMUP_SECONDS = 30
MIN_GAP_SECONDS = 90
MAX_HINTS_PER_CALL = 3


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _seconds_since(iso: str | None) -> float:
    if not iso:
        return float("inf")
    try:
        t = datetime.fromisoformat(iso)
        return (datetime.now(timezone.utc) - t).total_seconds()
    except Exception:
        return float("inf")


def _get_min_gap(ctx: dict) -> float:
    return float(ctx.get("adaptiveGapSeconds", MIN_GAP_SECONDS))


def _throttled(ctx: dict[str, Any]) -> bool:
    """Return True if hint should be suppressed."""
    if ctx.get("hintCount", 0) >= MAX_HINTS_PER_CALL:
        return True
    last = ctx.get("lastHintAt")
    if last and _seconds_since(last) < _get_min_gap(ctx):
        return True
    return False


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z\s]", "", text.lower()).strip()


# -- Trigger 1: Mistake Recurrence --------------------------------------------

def check_mistake_recurrence(transcript: str, ctx: dict[str, Any]) -> dict[str, Any] | None:
    norm = _normalize(transcript)
    tokens = set(norm.split())
    for task in ctx.get("activeTasks", []):
        user_said = _normalize(task.get("userSaid", ""))
        if user_said and user_said in norm:
            target = task.get("target", "")
            return {
                "trigger": "mistake_recurrence",
                "text": f'Remember: "{target}"',
                "taskId": task.get("id"),
                "watchPhrase": target.lower().split()[0] if target else "",
            }
        for fw in task.get("focusWords", []):
            fw_norm = _normalize(fw)
            if fw_norm and fw_norm not in tokens:
                user_said_tokens = set(_normalize(task.get("userSaid", "")).split())
                if user_said_tokens & tokens:
                    target = task.get("target", "")
                    return {
                        "trigger": "mistake_recurrence",
                        "text": f'Try saying: "{target}"',
                        "taskId": task.get("id"),
                        "focusWord": fw,
                        "watchPhrase": target.lower().split()[0] if target else "",
                    }
    return None


# -- Trigger 2: Missed Opportunity --------------------------------------------

async def check_missed_opportunity(
    transcript: str, ctx: dict[str, Any]
) -> dict[str, Any] | None:
    """Use Gemini Flash to detect if phrase/word could fit. Low-cost call."""
    phrase_obj = ctx.get("phraseOfDay")
    word_obj = ctx.get("wordOfDay")

    candidate = None
    kind = None
    if phrase_obj and not ctx.get("usedPhraseOfDay"):
        candidate = phrase_obj.get("phrase", "")
        kind = "phrase"
    elif word_obj and not ctx.get("usedWordOfDay"):
        candidate = word_obj.get("word", "")
        kind = "word"

    if not candidate:
        return None

    if _normalize(candidate) in _normalize(transcript):
        return None

    try:
        import google.generativeai as genai
        model = genai.GenerativeModel("gemini-2.0-flash")
        prompt = (
            f'The user said: "{transcript}"\n'
            f'They are learning the {"phrase" if kind == "phrase" else "word"}: "{candidate}"\n'
            f'Could they have naturally used "{candidate}" in what they said? Reply YES or NO only.'
        )
        response = await model.generate_content_async(prompt)
        answer = (response.text or "").strip().upper()
        if answer.startswith("YES"):
            field = "usedPhraseOfDay" if kind == "phrase" else "usedWordOfDay"
            return {
                "trigger": "missed_opportunity",
                "text": f'You could say "{candidate}" here',
                "kind": kind,
                "markField": field,
                "watchPhrase": candidate.lower(),
            }
    except Exception as e:
        logger.warning("missed_opportunity Gemini call failed: %s", e)
    return None


# -- Trigger 3: Periodic Nudge ------------------------------------------------

def check_periodic_nudge(ctx: dict[str, Any], call_elapsed_seconds: float) -> dict[str, Any] | None:
    if call_elapsed_seconds < 120:
        return None
    phrase_obj = ctx.get("phraseOfDay")
    if phrase_obj and not ctx.get("usedPhraseOfDay"):
        return {
            "trigger": "periodic_nudge",
            "text": f"Try working in \"{phrase_obj['phrase']}\" — your phrase of the day",
            "markField": "usedPhraseOfDay",
            "watchPhrase": phrase_obj["phrase"].lower(),
        }
    return None


# -- Main entry point ---------------------------------------------------------

async def get_hint(
    transcript: str,
    ctx: dict[str, Any],
    call_elapsed_seconds: float = 999,
) -> dict[str, Any] | None:
    """
    Returns a hint payload or None. Does NOT update Redis — caller does that.
    """
    if call_elapsed_seconds < WARMUP_SECONDS:
        return None
    if _throttled(ctx):
        return None
    if not transcript or not transcript.strip():
        return None

    hint = check_mistake_recurrence(transcript, ctx)
    if hint:
        return hint

    hint = await check_missed_opportunity(transcript, ctx)
    if hint:
        return hint

    hint = check_periodic_nudge(ctx, call_elapsed_seconds)
    return hint
