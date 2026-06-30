import { AnalyticsEvents } from "../analytics/events";
import { captureAnalyticsEvent } from "../analytics/analyticsBridge";
import { analyticsMeta } from "../analytics/eventMeta";
import { captureSentrySlowLatencyTrace } from "../sentry/sentry";
import type { LatencyTrace } from "./latencyTimeline";

export type LatencyTraceSummary = {
  trace_id: string;
  journey: string;
  total_ms: number;
  span_count: number;
  p95_span_ms: number;
  slowest_span_name?: string;
  slowest_span_ms?: number;
  server_timings?: Record<string, number>;
};

function getLatencySampleRate(): number {
  const raw = process.env.EXPO_PUBLIC_LATENCY_SAMPLE_RATE?.trim();
  if (raw) {
    const n = parseFloat(raw);
    if (!Number.isNaN(n) && n >= 0 && n <= 1) return n;
  }
  return __DEV__ ? 1.0 : 0.1;
}

function shouldSampleTrace(): boolean {
  const rate = getLatencySampleRate();
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return Math.random() < rate;
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function computeTotalMs(trace: LatencyTrace): number {
  const end = trace.spans.find((s) => s.name === "trace_end");
  const start = trace.spans.find((s) => s.name === "trace_start");
  if (end && start) return Math.max(0, end.startMs - start.startMs);
  const ends = trace.spans.map((s) => s.endMs ?? s.startMs);
  return ends.length > 0 ? Math.max(...ends) : 0;
}

export function summarizeLatencyTrace(trace: LatencyTrace): LatencyTraceSummary {
  const durations = trace.spans
    .map((s) => s.durationMs ?? 0)
    .filter((ms) => ms > 0);
  const slowest = trace.spans.reduce<{
    name: string;
    durationMs: number;
  } | null>((best, span) => {
    const ms = span.durationMs ?? 0;
    if (ms <= 0) return best;
    if (!best || ms > best.durationMs) {
      return { name: span.name, durationMs: ms };
    }
    return best;
  }, null);

  const summary: LatencyTraceSummary = {
    trace_id: trace.traceId,
    journey: trace.journey,
    total_ms: computeTotalMs(trace),
    span_count: trace.spans.length,
    p95_span_ms: percentile95(durations),
  };

  if (slowest) {
    summary.slowest_span_name = slowest.name;
    summary.slowest_span_ms = slowest.durationMs;
  }
  if (trace.serverTimings && Object.keys(trace.serverTimings).length > 0) {
    summary.server_timings = { ...trace.serverTimings };
  }
  return summary;
}

/** Sampled PostHog + Sentry export for completed latency traces. */
export function exportSampledTrace(trace: LatencyTrace): void {
  if (!shouldSampleTrace()) return;

  const summary = summarizeLatencyTrace(trace);

  captureAnalyticsEvent(
    AnalyticsEvents.LATENCY_TRACE,
    analyticsMeta(summary),
  );

  captureSentrySlowLatencyTrace(summary);
}
