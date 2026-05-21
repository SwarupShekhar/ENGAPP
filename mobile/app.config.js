/**
 * Expo app config. EAS Internal / preview builds use hosted URLs by default (see api/*.ts fallbacks).
 *
 * Local device testing against LAN backends: copy .env.example to .env and set APP_* overrides.
 * EAS: set BRIDGE_INTERNAL_SECRET in Expo dashboard (or `eas env:create`).
 * Do NOT set APP_API_URL_OVERRIDE / APP_BRIDGE_API_URL / APP_ENGLIVO_API_URL to LAN IPs
 * for preview/production — release builds will then call your laptop instead of Render.
 */
try {
  const path = require("path");
  const envDir = __dirname;
  // Always load from the mobile/ folder — bare `dotenv.config()` uses process.cwd(),
  // so starting Expo from the repo root skipped `mobile/.env` and broke BRIDGE_INTERNAL_SECRET.
  require("dotenv").config({ path: path.resolve(envDir, ".env") });
  require("dotenv").config({ path: path.resolve(envDir, ".env.local"), override: true });
} catch {
  // dotenv optional; EAS provides env without it
}

const projectId = "2286e998-c3a9-4582-bf36-0cfde9a7dc57";
const buildProfile = process.env.EAS_BUILD_PROFILE || "development";
const allowHttpApis = buildProfile !== "production";

const clerkPublishableKey =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  process.env.CLERK_PUBLISHABLE_KEY ||
  "pk_test_cmlnaHQtYmFzaWxpc2stOTEuY2xlcmsuYWNjb3VudHMuZGV2JA";

const extra = {
  eas: { projectId },
  clerkPublishableKey,
  bridgeInternalSecret: process.env.BRIDGE_INTERNAL_SECRET || "",
  posthogApiKey: process.env.EXPO_PUBLIC_POSTHOG_API_KEY || "",
  posthogHost:
    process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
  posthogSessionReplay:
    process.env.EXPO_PUBLIC_POSTHOG_SESSION_REPLAY === "true",
};

// Optional overrides — only when explicitly set (local .env or EAS env)
if (process.env.APP_API_URL_OVERRIDE?.trim()) {
  extra.apiUrlOverride = process.env.APP_API_URL_OVERRIDE.trim();
}
if (process.env.APP_BRIDGE_API_URL?.trim()) {
  extra.bridgeApiUrl = process.env.APP_BRIDGE_API_URL.trim();
}
if (process.env.APP_ENGLIVO_API_URL?.trim()) {
  extra.englivoApiUrlOverride = process.env.APP_ENGLIVO_API_URL.trim();
}
if (process.env.ENGLIVO_API_URL_OVERRIDE?.trim()) {
  extra.englivoApiUrlOverride = process.env.ENGLIVO_API_URL_OVERRIDE.trim();
}
if (process.env.ENGLIVO_WS_URL_OVERRIDE?.trim()) {
  extra.englivoWsUrlOverride = process.env.ENGLIVO_WS_URL_OVERRIDE.trim();
}

module.exports = {
  expo: {
    name: "Englivo",
    slug: "mobile",
    scheme: "engr",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#0d1b3d",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.swarupshekhar.mobile",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSSpeechRecognitionUsageDescription:
          "EngR uses speech recognition to provide real-time pronunciation feedback and transcription.",
        ...(allowHttpApis
          ? {
              NSAppTransportSecurity: {
                NSAllowsArbitraryLoads: true,
              },
            }
          : {}),
      },
    },
    android: {
      label: "Englivo",
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#1a1035",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.swarupshekhar.mobile",
      usesCleartextTraffic: allowHttpApis,
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    extra,
    plugins: [
      [
        "@livekit/react-native-expo-plugin",
        {
          cameraPermission: "Allow EngR to access your camera",
          microphonePermission: "Allow EngR to access your microphone",
        },
      ],
      "expo-speech-recognition",
      // Embeds pushy-react-native native code (MainApplication / iOS). Rebuild dev client after changing this.
      [
        "pushy-expo-plugin",
        {
          "aps-environment":
            process.env.EAS_BUILD_PROFILE === "production" ||
            process.env.EAS_BUILD_PROFILE === "store"
              ? "production"
              : "development",
        },
      ],
    ],
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: `https://u.expo.dev/${projectId}`,
    },
  },
};
