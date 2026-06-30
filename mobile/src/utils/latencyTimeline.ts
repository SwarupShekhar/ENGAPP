/**
 * Lightweight span timeline for latency debugging (Maya, feedback, home).
 * Dev: full timeline + JSON log. Prod: sampled export to PostHog + Sentry.
 */

import { exportSampledTrace } from "./latencyExport";

export type LatencyJourney =
  | 'maya_turn'
  | 'maya_ws'
  | 'feedback_load'
  | 'home_focus'
  | 'custom';

export type LatencySpan = {
  name: string;
  startMs: number;
  endMs?: number;
  durationMs?: number;
  meta?: Record<string, string | number | boolean>;
};

export type LatencyTrace = {
  traceId: string;
  journey: LatencyJourney;
  startedAt: number;
  spans: LatencySpan[];
  serverTimings?: Record<string, number>;
};

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function makeTraceId(): string {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class LatencyTimeline {
  private trace: LatencyTrace | null = null;
  private openSpans = new Map<string, number>();

  start(journey: LatencyJourney, traceId?: string): string {
    const id = traceId ?? makeTraceId();
    this.trace = {
      traceId: id,
      journey,
      startedAt: nowMs(),
      spans: [],
    };
    this.openSpans.clear();
    this.markInstant('trace_start');
    return id;
  }

  get traceId(): string | null {
    return this.trace?.traceId ?? null;
  }

  getSnapshot(): LatencyTrace | null {
    if (!this.trace) return null;
    return {
      ...this.trace,
      spans: [...this.trace.spans],
      serverTimings: this.trace.serverTimings
        ? { ...this.trace.serverTimings }
        : undefined,
    };
  }

  /** Point-in-time marker (duration 0). */
  markInstant(name: string, meta?: LatencySpan['meta']): void {
    if (!this.trace) return;
    const t = nowMs() - this.trace.startedAt;
    this.trace.spans.push({
      name,
      startMs: t,
      endMs: t,
      durationMs: 0,
      meta,
    });
  }

  startSpan(name: string, meta?: LatencySpan['meta']): void {
    if (!this.trace) return;
    this.openSpans.set(name, nowMs());
    if (meta) {
      this.markInstant(`${name}_begin`, meta);
    }
  }

  endSpan(name: string, meta?: LatencySpan['meta']): void {
    if (!this.trace) return;
    const start = this.openSpans.get(name);
    if (start === undefined) {
      this.markInstant(name, meta);
      return;
    }
    this.openSpans.delete(name);
    const end = nowMs();
    const startMs = start - this.trace.startedAt;
    const endMs = end - this.trace.startedAt;
    this.trace.spans.push({
      name,
      startMs,
      endMs,
      durationMs: end - start,
      meta,
    });
  }

  mergeServerTimings(timings: Record<string, number> | undefined): void {
    if (!this.trace || !timings) return;
    this.trace.serverTimings = { ...(this.trace.serverTimings ?? {}), ...timings };
    for (const [key, ms] of Object.entries(timings)) {
      this.trace.spans.push({
        name: `server:${key}`,
        startMs: ms,
        endMs: ms,
        durationMs: 0,
        meta: { source: 'server' },
      });
    }
  }

  finish(meta?: Record<string, string | number | boolean>): void {
    if (!this.trace) return;
    this.markInstant('trace_end', meta);
    const snap = this.getSnapshot();
    if (snap) {
      if (__DEV__) {
        console.log(
          `[Latency:${snap.journey}] ${snap.traceId}`,
          JSON.stringify(snap, null, 0),
        );
      }
      exportSampledTrace(snap);
    }
  }

  reset(): void {
    this.trace = null;
    this.openSpans.clear();
  }
}

/** Singleton for active screen (Maya / feedback). */
export const activeLatencyTimeline = new LatencyTimeline();
