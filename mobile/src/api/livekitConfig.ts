import { readExpoExtra } from "./expoExtra";

/** EngR P2P calls — must match Nest `LIVEKIT_URL` project. */
const DEFAULT_ENGR_LIVEKIT_URL = "wss://engrapp-8lz8v8ia.livekit.cloud";

/** Englivo human tutor — separate LiveKit cloud project. */
const DEFAULT_ENGLIVO_LIVEKIT_URL = "wss://ssengst-174tfe9o.livekit.cloud";

function trimEnv(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveLiveKitUrl(options: {
  publicEnvKey: string;
  extraKey: string;
  fallback: string;
  label: string;
}): string {
  const fromPublicEnv = trimEnv(process.env[options.publicEnvKey]);
  const fromExtra = trimEnv(readExpoExtra(options.extraKey));
  const url = fromPublicEnv || fromExtra || options.fallback;

  if (!fromPublicEnv && !fromExtra && !__DEV__) {
    console.warn(
      `[EngR] ${options.label} LiveKit URL using built-in default. Set ${options.publicEnvKey} in EAS for staging/prod.`,
    );
  }

  if (__DEV__) {
    console.log(`[LiveKit] ${options.label}: ${url}`);
  }

  return url;
}

/** WebSocket URL for EngR peer-to-peer calls (`InCallScreen`). */
export const ENGR_LIVEKIT_URL = resolveLiveKitUrl({
  publicEnvKey: "EXPO_PUBLIC_LIVEKIT_URL",
  extraKey: "livekitUrl",
  fallback: DEFAULT_ENGR_LIVEKIT_URL,
  label: "EngR P2P",
});

/** WebSocket URL for Englivo human-tutor calls (`EnglivoLiveCallScreen`). */
export const ENGLIVO_LIVEKIT_URL = resolveLiveKitUrl({
  publicEnvKey: "EXPO_PUBLIC_ENGLIVO_LIVEKIT_URL",
  extraKey: "englivoLivekitUrl",
  fallback: DEFAULT_ENGLIVO_LIVEKIT_URL,
  label: "Englivo tutor",
});
