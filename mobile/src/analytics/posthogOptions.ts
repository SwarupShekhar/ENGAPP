import type { PostHogOptions } from "posthog-react-native";
import { POSTHOG_HOST, POSTHOG_SESSION_REPLAY_ENABLED } from "./posthogConfig";

export function buildPostHogOptions(): PostHogOptions {
  const options: PostHogOptions = {
    host: POSTHOG_HOST,
    captureAppLifecycleEvents: true,
  };

  if (POSTHOG_SESSION_REPLAY_ENABLED) {
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
