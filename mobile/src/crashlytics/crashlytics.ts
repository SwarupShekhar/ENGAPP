import { Platform } from "react-native";

type CrashlyticsInstance = ReturnType<
  typeof import("@react-native-firebase/crashlytics").default
>;

let crashlyticsFactory: (() => CrashlyticsInstance) | null = null;

async function getCrashlytics(): Promise<CrashlyticsInstance | null> {
  if (Platform.OS === "web") return null;
  if (!crashlyticsFactory) {
    try {
      const mod = await import("@react-native-firebase/crashlytics");
      crashlyticsFactory = mod.default;
    } catch {
      return null;
    }
  }
  return crashlyticsFactory();
}

/** Enable native crash reporting (Android/iOS dev builds). Skips web. */
export async function initCrashlytics(): Promise<void> {
  const crashlytics = await getCrashlytics();
  if (!crashlytics) return;

  await crashlytics.setCrashlyticsCollectionEnabled(!__DEV__);
  crashlytics.log("crashlytics_initialized");
}

export async function recordCrashlyticsError(
  error: Error,
  context?: string,
): Promise<void> {
  const crashlytics = await getCrashlytics();
  if (!crashlytics) return;

  if (context) {
    crashlytics.log(context);
  }
  await crashlytics.recordError(error);
}

export async function setCrashlyticsUserId(
  userId: string | null | undefined,
): Promise<void> {
  const crashlytics = await getCrashlytics();
  if (!crashlytics) return;

  await crashlytics.setUserId(userId?.trim() ? userId : "");
}

export async function logCrashlytics(message: string): Promise<void> {
  const crashlytics = await getCrashlytics();
  if (!crashlytics) return;
  crashlytics.log(message);
}
