import Constants from "expo-constants";
import * as Application from "expo-application";
import { Platform } from "react-native";

export function analyticsMeta(overrides?: Record<string, unknown>) {
  const appVersion =
    Constants.expoConfig?.version ||
    Constants.manifest2?.extra?.expoClient?.version ||
    "unknown";

  return {
    app_version: appVersion,
    build_number:
      Application.nativeBuildVersion ||
      Application.nativeApplicationVersion ||
      "unknown",
    platform: Platform.OS,
    os_version: String(Platform.Version ?? "unknown"),
    environment: __DEV__ ? "dev" : "alpha",
    network_type: "unknown",
    ...(overrides ?? {}),
  };
}

