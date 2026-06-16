import Constants from "expo-constants";

type SentryExtra = {
  sentryDsn?: string;
  sentryEnvironment?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as SentryExtra;

/** Same Sentry org as backend-nest / backend-ai; use a dedicated mobile project DSN. */
export const SENTRY_DSN =
  process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() || extra.sentryDsn?.trim() || "";

export const SENTRY_ENVIRONMENT =
  process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT?.trim() ||
  extra.sentryEnvironment?.trim() ||
  process.env.EAS_BUILD_PROFILE ||
  (__DEV__ ? "development" : "production");

export const isSentryEnabled = SENTRY_DSN.length > 0;
