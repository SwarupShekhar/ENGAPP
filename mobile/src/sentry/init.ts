import * as Sentry from "@sentry/react-native";
import {
  isSentryEnabled,
  SENTRY_DSN,
  SENTRY_ENVIRONMENT,
} from "./sentryConfig";

if (isSentryEnabled) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    // Performance: sample in internal/prod; full in dev when DSN is set.
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    enableAutoSessionTracking: true,
    attachStacktrace: true,
    enableNative: true,
    enableNativeCrashHandling: true,
  });
} else if (__DEV__) {
  console.warn(
    "[Sentry] EXPO_PUBLIC_SENTRY_DSN not set — mobile errors only go to Crashlytics/logs",
  );
}

export { Sentry };
