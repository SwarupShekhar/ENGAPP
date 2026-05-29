import type { PostHogEventProperties } from "@posthog/core";

type CaptureFn = (event: string, properties?: PostHogEventProperties) => void;

let captureFn: CaptureFn | null = null;

/** Register PostHog capture from AnalyticsProvider (for non-React modules). */
export function registerAnalyticsCapture(fn: CaptureFn | null): void {
  captureFn = fn;
}

export function captureAnalyticsEvent(
  event: string,
  properties?: PostHogEventProperties,
): void {
  try {
    captureFn?.(event, properties);
  } catch (err) {
    if (__DEV__) {
      console.warn("[Analytics] capture failed:", event, err);
    }
  }
}
