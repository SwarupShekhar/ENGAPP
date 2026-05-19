import { createContext, useContext } from "react";
import type { PostHogEventProperties } from "@posthog/core";

export type AnalyticsClient = {
  capture: (event: string, properties?: PostHogEventProperties) => void;
  identify: (userId: string, properties?: PostHogEventProperties) => void;
  reset: () => void;
};

export const noopAnalytics: AnalyticsClient = {
  capture: () => {},
  identify: () => {},
  reset: () => {},
};

export const AnalyticsContext = createContext<AnalyticsClient>(noopAnalytics);

export function useAnalytics(): AnalyticsClient {
  return useContext(AnalyticsContext);
}
