import Constants from "expo-constants";

type AnalyticsExtra = {
  posthogApiKey?: string;
  posthogHost?: string;
  posthogSessionReplay?: boolean;
};

const extra = (Constants.expoConfig?.extra ?? {}) as AnalyticsExtra;

/** Project API key (phc_…), not the personal wizard key (phx_…). */
export const POSTHOG_API_KEY =
  process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() ||
  extra.posthogApiKey?.trim() ||
  "";

export const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() ||
  extra.posthogHost?.trim() ||
  "https://us.i.posthog.com";

export const isPostHogEnabled = POSTHOG_API_KEY.length > 0;

/** Requires dev build (not Expo Go) + session replay enabled in PostHog project settings. */
export const POSTHOG_SESSION_REPLAY_ENABLED =
  isPostHogEnabled &&
  (process.env.EXPO_PUBLIC_POSTHOG_SESSION_REPLAY === "true" ||
    extra.posthogSessionReplay === true);
