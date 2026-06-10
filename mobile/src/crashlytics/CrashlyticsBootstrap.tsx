import { useEffect } from "react";
import { Platform } from "react-native";
import { initCrashlytics } from "./crashlytics";

/** One-time Crashlytics init on native app start. */
export function CrashlyticsBootstrap() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    void initCrashlytics();
  }, []);

  return null;
}
