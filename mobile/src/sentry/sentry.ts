import { Sentry } from "./init";
import { isSentryEnabled } from "./sentryConfig";

export { Sentry, isSentryEnabled };

export function captureSentryException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!isSentryEnabled) return;
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext("extra", context);
    }
    Sentry.captureException(error);
  });
}

const SLOW_LATENCY_MS = 3000;

export function captureSentrySlowLatencyTrace(
  summary: Record<string, unknown>,
): void {
  if (!isSentryEnabled) return;
  const totalMs = Number(summary.total_ms ?? summary.totalMs ?? 0);
  if (totalMs < SLOW_LATENCY_MS) return;
  Sentry.withScope((scope) => {
    scope.setLevel("info");
    scope.setContext("latency_trace", summary);
    const journey = String(summary.journey ?? "unknown");
    Sentry.captureMessage(`latency_trace slow: ${journey} ${totalMs}ms`);
  });
}

export function setSentryUser(
  userId: string | null | undefined,
  traits?: { email?: string; username?: string },
): void {
  if (!isSentryEnabled) return;
  if (!userId?.trim()) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: userId,
    email: traits?.email,
    username: traits?.username,
  });
}
