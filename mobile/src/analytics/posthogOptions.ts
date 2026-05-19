import type { PostHogOptions } from "posthog-react-native";
import { Platform } from "react-native";
import { POSTHOG_HOST, POSTHOG_SESSION_REPLAY_ENABLED } from "./posthogConfig";

export function buildPostHogOptions(): PostHogOptions {
  const options: PostHogOptions = {
    host: POSTHOG_HOST,
    captureAppLifecycleEvents: Platform.OS !== "web",
  };

  // Session replay uses native modules — crashes web at startup.
  if (POSTHOG_SESSION_REPLAY_ENABLED && Platform.OS !== "web") {
    options.enableSessionReplay = true;
    options.sessionReplayConfig = {
      maskAllTextInputs: true,
      maskAllImages: true,
      captureLog: true,
      captureNetworkTelemetry: true,
      throttleDelayMs: 1000,
    };
  }

  return options;
}
