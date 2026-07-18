"""
Instrumentation for the grammar grader so a silent revert to the (blind)
structural heuristic is loud, not invisible.

Every grade records source = "llm" | "structural_fallback". We:
- increment an OpenTelemetry counter (exported to Grafana when OTel is on),
- keep in-process counts for the /health endpoint,
- emit a WARNING on every fallback (with reason), and
- emit an ERROR when the fallback rate crosses a threshold over a min sample,
  so it can page/alert instead of quietly degrading grammar under load.
"""

from __future__ import annotations

import logging
import threading
from typing import Any, Dict, Optional

logger = logging.getLogger("scoring.grammar")

# Alert once the fallback rate crosses this over at least this many samples.
FALLBACK_ALERT_RATE = 0.05
FALLBACK_ALERT_MIN_SAMPLES = 20

_lock = threading.Lock()
_counts: Dict[str, int] = {"total": 0, "llm": 0, "structural_fallback": 0}
_by_reason: Dict[str, int] = {}
_by_provider: Dict[str, int] = {}
_alerted = False

_otel_counter = None
_otel_ready = False


def _get_otel_counter():
    global _otel_counter, _otel_ready
    if _otel_ready:
        return _otel_counter
    _otel_ready = True
    try:
        from opentelemetry import metrics

        meter = metrics.get_meter("engr.scoring.grammar")
        _otel_counter = meter.create_counter(
            "grammar_grader_calls_total",
            description="Grammar grades by source (llm vs structural_fallback)",
        )
    except Exception:  # noqa: BLE001 — metrics are best-effort
        _otel_counter = None
    return _otel_counter


def record(
    source: str,
    *,
    reason: Optional[str] = None,
    provider: Optional[str] = None,
) -> None:
    """Record one grammar grade. source: 'llm' or 'structural_fallback'."""
    global _alerted
    counter = _get_otel_counter()
    if counter is not None:
        try:
            counter.add(
                1,
                {
                    "source": source,
                    "reason": reason or "none",
                    "provider": provider or "none",
                },
            )
        except Exception:  # noqa: BLE001
            pass

    with _lock:
        _counts["total"] += 1
        _counts[source] = _counts.get(source, 0) + 1
        if reason:
            _by_reason[reason] = _by_reason.get(reason, 0) + 1
        if provider:
            _by_provider[provider] = _by_provider.get(provider, 0) + 1
        total = _counts["total"]
        fallbacks = _counts["structural_fallback"]
        rate = fallbacks / total if total else 0.0
        should_alert = (
            total >= FALLBACK_ALERT_MIN_SAMPLES
            and rate > FALLBACK_ALERT_RATE
            and not _alerted
        )
        if should_alert:
            _alerted = True

    if source == "structural_fallback":
        logger.warning(
            "grammar_source=structural_fallback reason=%s provider=%s "
            "(grammar reverted to blind structural heuristic)",
            reason or "unknown",
            provider or "none",
        )
    if should_alert:
        logger.error(
            "grammar_fallback_rate_alert rate=%.3f threshold=%.3f total=%d "
            "fallbacks=%d — LLM grammar grader is degrading; investigate.",
            rate,
            FALLBACK_ALERT_RATE,
            total,
            fallbacks,
        )


def snapshot() -> Dict[str, Any]:
    with _lock:
        total = _counts["total"]
        fallbacks = _counts["structural_fallback"]
        return {
            "total": total,
            "llm": _counts.get("llm", 0),
            "structural_fallback": fallbacks,
            "fallback_rate": round(fallbacks / total, 4) if total else 0.0,
            "by_reason": dict(_by_reason),
            "by_provider": dict(_by_provider),
            "alerting": total >= FALLBACK_ALERT_MIN_SAMPLES
            and (fallbacks / total if total else 0.0) > FALLBACK_ALERT_RATE,
        }


def reset() -> None:
    """Test-only: clear counters."""
    global _alerted
    with _lock:
        _counts.update({"total": 0, "llm": 0, "structural_fallback": 0})
        _by_reason.clear()
        _by_provider.clear()
        _alerted = False
