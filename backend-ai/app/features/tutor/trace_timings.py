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

    def mark(self, name: str) -> None:
        self._marks[name] = round((time.perf_counter() - self._t0) * 1000, 1)

    def to_dict(self) -> dict[str, Any]:
        return {"trace_id": self.trace_id, "ms": dict(self._marks)}

    def log_summary(self, journey: str = "maya_sse") -> None:
        logger.info(
            "[latency] journey=%s trace_id=%s timings=%s",
            journey,
            self.trace_id,
            self._marks,
        )
