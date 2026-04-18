/**
 * Expo app config. EAS Internal / preview builds use hosted URLs by default (see api/*.ts fallbacks).
 *
 * Local device testing against LAN backends: copy .env.example to .env and set APP_* overrides.
 * EAS: set BRIDGE_INTERNAL_SECRET in Expo dashboard (or `eas env:create`).
 * Do NOT set APP_API_URL_OVERRIDE / APP_BRIDGE_API_URL / APP_ENGLIVO_API_URL to LAN IPs
 * for preview/production — release builds will then call your laptop instead of Render.
 */
try {
  require("dotenv").config();
} catch {
  // dotenv optional; EAS provides env without it
}

const projectId = "2286e998-c3a9-4582-bf36-0cfde9a7dc57";

const clerkPublishableKey =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  process.env.CLERK_PUBLISHABLE_KEY ||
  "pk_test_cmlnaHQtYmFzaWxpc2stOTEuY2xlcmsuYWNjb3VudHMuZGV2JA";

const extra = {
  eas: { projectId },
  clerkPublishableKey,
  bridgeInternalSecret: process.env.BRIDGE_INTERNAL_SECRET || "",
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

module.exports = {
  expo: {
    name: "mobile",
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
      backgroundColor: "#ffffff",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.swarupshekhar.mobile",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSSpeechRecognitionUsageDescription:
          "EngR uses speech recognition to provide real-time pronunciation feedback and transcription.",
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.swarupshekhar.mobile",
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
    ],
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: `https://u.expo.dev/${projectId}`,
    },
  },
};
