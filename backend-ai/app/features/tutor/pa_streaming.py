"""
Phase 2.1: Bounded wait for pronunciation enrichment before LLM stream.

- Waits up to `pa_stream_wait_ms` for Azure PA (pass 2+3) so Maya can coach in-turn.
- Never blocks unbounded: on timeout, stream without phonetic context; PA still finishes for capture.
- Global semaphore caps concurrent PA enrichments so one VM does not melt under load.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.core.config import settings
from app.features.transcription.hinglish_stt_service import hinglish_stt_service
from app.features.tutor.trace_timings import TraceTimings

logger = logging.getLogger(__name__)

_pa_enrich_semaphore: asyncio.Semaphore | None = None


def _semaphore() -> asyncio.Semaphore:
    global _pa_enrich_semaphore
    if _pa_enrich_semaphore is None:
        limit = max(1, int(settings.pa_enrich_max_concurrent))
        _pa_enrich_semaphore = asyncio.Semaphore(limit)
    return _pa_enrich_semaphore


def pa_wait_budget_seconds() -> float:
    return max(0.0, settings.pa_stream_wait_ms) / 1000.0


def has_usable_phonetic_context(ctx: dict[str, Any] | None) -> bool:
    """True when the client already sent assess results — skip duplicate server PA."""
    if not ctx:
        return False
    if ctx.get("accuracy_score") is not None:
        return True
    if ctx.get("words"):
        return True
    insights = ctx.get("phonetic_insights")
    if isinstance(insights, dict):
        if insights.get("critical_errors") or insights.get("minor_errors"):
            return True
        if insights.get("words"):
            return True
    if ctx.get("critical_errors") or ctx.get("minor_errors"):
        return True
    return False


def start_phonetic_enrichment_task(
    audio_bytes: bytes,
    user_utterance: str,
) -> asyncio.Task:
    """Run enrich_phonetic_insights in a thread, gated by global concurrency."""

    async def _guarded_enrich() -> dict | None:
        async with _semaphore():
            return await asyncio.to_thread(
                hinglish_stt_service.enrich_phonetic_insights,
                audio_bytes,
                user_utterance,
            )

    return asyncio.create_task(_guarded_enrich())


async def phonetic_context_for_stream(
    pa_task: asyncio.Task | None,
    *,
    client_phonetic: dict[str, Any] | None = None,
    timings: TraceTimings | None = None,
) -> tuple[dict[str, Any], bool]:
    """
    Context injected into Gemini for this turn.

    Returns (phonetic_context, pa_included_in_prompt).
    """
    if has_usable_phonetic_context(client_phonetic):
        timings and timings.mark("pa_client_context")
        return client_phonetic or {}, True

    if pa_task is None:
        return {}, False

    budget = pa_wait_budget_seconds()
    if budget <= 0:
        timings and timings.mark("pa_wait_skipped")
        return {}, False

    try:
        result = await asyncio.wait_for(asyncio.shield(pa_task), timeout=budget)
        if result:
            logger.info(
                "PA ready within %.0fms budget; including phonetic context in stream",
                settings.pa_stream_wait_ms,
            )
            timings and timings.mark("pa_in_prompt")
            return result, True
        timings and timings.mark("pa_empty_result")
        return {}, False
    except asyncio.TimeoutError:
        logger.info(
            "PA wait budget exceeded (%.0fms); streaming without in-turn phonetic context",
            settings.pa_stream_wait_ms,
        )
        timings and timings.mark("pa_wait_timeout")
        return {}, False
    except Exception as e:
        logger.warning("PA wait for stream failed (non-fatal): %s", e)
        timings and timings.mark("pa_wait_error")
        return {}, False


async def phonetic_context_for_capture(
    pa_task: asyncio.Task | None,
    stream_phonetic: dict[str, Any],
    timings: TraceTimings | None = None,
) -> dict[str, Any]:
    """Always prefer completed server PA for session capture; fall back to stream/client context."""
    if pa_task is None:
        return stream_phonetic or {}

    try:
        enriched = await pa_task
        if enriched:
            timings and timings.mark("pa_capture_ready")
            return enriched
    except Exception as e:
        logger.warning("PA finalize for capture failed (non-fatal): %s", e)
        timings and timings.mark("pa_capture_error")

    timings and timings.mark("pa_capture_fallback")
    return stream_phonetic or {}
