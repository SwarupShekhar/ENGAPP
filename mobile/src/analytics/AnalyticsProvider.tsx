import React, { useMemo } from "react";
import { Platform } from "react-native";
import { PostHogProvider, usePostHog } from "posthog-react-native";
import { buildPostHogOptions } from "./posthogOptions";
import { isPostHogEnabled, POSTHOG_API_KEY } from "./posthogConfig";
import {
  AnalyticsContext,
  noopAnalytics,
  type AnalyticsClient,
} from "./useAnalytics";

function PostHogBridge({ children }: { children: React.ReactNode }) {
  const posthog = usePostHog();
  const client = useMemo<AnalyticsClient>(
    () => ({
      capture: (event, properties) => posthog.capture(event, properties),
      identify: (userId, properties) => posthog.identify(userId, properties),
      reset: () => posthog.reset(),
    }),
    [posthog],
  );
  return (
    <AnalyticsContext.Provider value={client}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  // PostHog RN session replay / native bits break web startup — skip on web for local UI dev.
  if (Platform.OS === "web" || !isPostHogEnabled) {
    if (__DEV__) {
      console.warn(
        "[PostHog] EXPO_PUBLIC_POSTHOG_API_KEY not set — product analytics disabled",
      );
    }
    return (
      <AnalyticsContext.Provider value={noopAnalytics}>
        {children}
      </AnalyticsContext.Provider>
    );
  }

  return (
    <PostHogProvider apiKey={POSTHOG_API_KEY} options={buildPostHogOptions()}>
      <PostHogBridge>{children}</PostHogBridge>
    </PostHogProvider>
  );
}
