"""Per-request latency marks for tutor streaming (included in SSE `done`)."""
from __future__ import annotations

import logging
import time
from typing import Any

logger = logging.getLogger(__name__)


class TraceTimings:
    def __init__(self, trace_id: str = "") -> None:
        self.trace_id = trace_id or "unknown"
        self._t0 = time.perf_counter()
        self._marks: dict[str, float] = {}
        self._meta: dict[str, Any] = {}

    def mark(self, name: str) -> None:
        self._marks[name] = round((time.perf_counter() - self._t0) * 1000, 1)

    def set_meta(self, **kwargs: Any) -> None:
        self._meta.update(kwargs)

    def delta_ms(self, end: str, start: str) -> float | None:
        if end not in self._marks or start not in self._marks:
            return None
        return round(self._marks[end] - self._marks[start], 1)

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"trace_id": self.trace_id, "ms": dict(self._marks)}
        if self._meta:
            out["meta"] = dict(self._meta)
        # Convenience deltas for operators (no secrets).
        stt_ms = self.delta_ms("stt_done", "request_start")
        llm_gap_ms = self.delta_ms("llm_stream_start", "stt_done")
        if stt_ms is not None:
            out["stt_ms"] = stt_ms
        if llm_gap_ms is not None:
            out["llm_gap_ms"] = llm_gap_ms
        return out

    def log_summary(self, journey: str = "maya_sse") -> None:
        logger.info(
            "[latency] journey=%s trace_id=%s stt_ms=%s llm_gap_ms=%s "
            "first_sentence_ms=%s first_audio_ms=%s meta=%s timings=%s",
            journey,
            self.trace_id,
            self.delta_ms("stt_done", "request_start"),
            self.delta_ms("llm_stream_start", "stt_done"),
            self._marks.get("first_sentence"),
            self._marks.get("first_audio"),
            self._meta,
            self._marks,
        )
