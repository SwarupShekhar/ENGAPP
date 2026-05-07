import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
import {
  coerceReleaseApiOverride,
  rewriteDevLanOverride,
} from "./releaseUrlOverride";
import { readExpoExtra } from "./expoExtra";
import { getDevBundleHostname } from "./devPackagerHost";
import { getCachedToken } from "./authToken";

const IS_PROD = !__DEV__;
const isDevice = Constants.isDevice;

const _hostUri: string | undefined = (Constants.expoConfig as { hostUri?: string } | null)
  ?.hostUri;
const DEV_BUNDLE_HOST = getDevBundleHostname();
const LOCAL_IP =
  DEV_BUNDLE_HOST ||
  (_hostUri ? _hostUri.split(":")[0] : undefined) ||
  "172.20.10.13";

const bridgeUrlFromPublicEnv =
  typeof process.env.EXPO_PUBLIC_BRIDGE_API_URL === "string"
    ? process.env.EXPO_PUBLIC_BRIDGE_API_URL.trim()
    : "";
const bridgeUrlFromExtra = readExpoExtra("bridgeApiUrl");
const DEV_REWRITTEN_BRIDGE_OVERRIDE = rewriteDevLanOverride(
  bridgeUrlFromPublicEnv || bridgeUrlFromExtra || null,
  DEV_BUNDLE_HOST,
  "Bridge API",
);

const EXTRA_BRIDGE_URL_OVERRIDE = coerceReleaseApiOverride(
  DEV_REWRITTEN_BRIDGE_OVERRIDE,
  "Bridge API",
);

const BRIDGE_API_URL =
  (typeof EXTRA_BRIDGE_URL_OVERRIDE === "string" && EXTRA_BRIDGE_URL_OVERRIDE.trim()
    ? EXTRA_BRIDGE_URL_OVERRIDE.trim()
    : null) ||
  // Bridge has no local server — always use the hosted URL.
  "https://bridge-api-3m4n.onrender.com";

if (__DEV__) console.log("[Bridge API] Resolved URL:", BRIDGE_API_URL);
if (__DEV__) console.log("[Bridge API] Internal secret loaded:", Boolean(readExpoExtra("bridgeInternalSecret")));

const INTERNAL_SECRET =
  readExpoExtra("bridgeInternalSecret") ||
  process.env.BRIDGE_INTERNAL_SECRET ||
  process.env.EXPO_PUBLIC_BRIDGE_INTERNAL_SECRET ||
  "";

export const hasBridgeInternalSecret = (): boolean => Boolean(INTERNAL_SECRET);
let hasWarnedBridgeReadUnauthorized = false;
let hasWarnedBridgeSecretMissing = false;

const warnBridgeSecretMissing = () => {
  if (hasWarnedBridgeSecretMissing) return;
  hasWarnedBridgeSecretMissing = true;
  const message =
    "[Bridge API] Skipping protected Bridge request: BRIDGE_INTERNAL_SECRET is not configured.";
  if (__DEV__) {
    console.warn(message);
  } else {
    // In production keep one strong signal so this does not fail silently forever.
    console.error(`${message} Bridge syncs are disabled until this env var is set.`);
  }
};

const bridgeClient = axios.create({
  baseURL: BRIDGE_API_URL,
  headers: {
    "Content-Type": "application/json",
    ...(INTERNAL_SECRET ? { "x-internal-secret": INTERNAL_SECRET } : {}),
  },
  timeout: 5000,
});

let getToken: (() => Promise<string | null>) | null = null;

export const setAuthTokenFetcher = (fetcher: () => Promise<string | null>) => {
  getToken = fetcher;
};

bridgeClient.interceptors.request.use(
  async (config) => {
    // Always enforce internal secret at request-time so it cannot be dropped
    // by per-request config overrides.
    if (INTERNAL_SECRET) {
      config.headers["x-internal-secret"] = INTERNAL_SECRET;
    }
    if (getToken) {
      const token = await getCachedToken(getToken);
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    if (__DEV__) {
      console.log(
        "[Bridge API] Request auth headers:",
        JSON.stringify({
          hasInternalSecret: Boolean(config.headers?.["x-internal-secret"]),
          hasAuthorization: Boolean(config.headers?.Authorization),
          url: config.url,
          method: config.method,
        }),
      );
    }
    return config;
  },
  (error) => Promise.reject(error),
);

if (__DEV__) {
  bridgeClient.interceptors.response.use(
    (response) => {
      console.log(`[Bridge API] ${response.config.method?.toUpperCase()} ${response.config.url} -> ${response.status}`);
      return response;
    },
    (error) => {
      if (error?.response) {
        console.error(
          `[Bridge API] Error ${error.response.status} on ${error.config?.url}:`,
          error.response.data,
        );
      } else {
        // No HTTP response means transport-level failure (DNS, localhost/device mismatch, server unreachable, etc).
        console.error(
          `[Bridge API] Network error on ${error.config?.url}:`,
          error?.message || error,
        );
      }
      return Promise.reject(error);
    },
  );
}

export async function getBridgeUser(clerkId: string): Promise<any> {
  if (!INTERNAL_SECRET) {
    warnBridgeSecretMissing();
    return null;
  }
  try {
    const r = await bridgeClient.get(`/user/${clerkId}`);
    return r.data;
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 401) {
      if (!hasWarnedBridgeReadUnauthorized) {
        hasWarnedBridgeReadUnauthorized = true;
        console.warn(
          "[Bridge API] Unauthorized on GET /user/:clerkId. Check bridgeInternalSecret in Expo config vs Bridge backend INTERNAL_SECRET.",
        );
      }
      return null;
    }
    // Network error (unreachable host, timeout, no local bridge server) — degrade silently.
    if (!error?.response) {
      return null;
    }
    throw error;
  }
}

export async function updateLastActiveApp(
  clerkId: string,
  app: "PULSE" | "CORE",
): Promise<any> {
  if (!INTERNAL_SECRET) {
    warnBridgeSecretMissing();
    return null;
  }
  const r = await bridgeClient.patch(`/user/${clerkId}`, { last_active_app: app });
  return r.data;
}

export async function incrementBridgeStreak(clerkId: string): Promise<any> {
  if (!INTERNAL_SECRET) {
    warnBridgeSecretMissing();
    return null;
  }
  const r = await bridgeClient.patch(`/user/${clerkId}/streak`);
  return r.data;
}

export async function addBridgePracticeMinutes(
  clerkId: string,
  minutes: number,
): Promise<any> {
  if (!INTERNAL_SECRET) {
    warnBridgeSecretMissing();
    return null;
  }
  const r = await bridgeClient.patch(`/user/${clerkId}/minutes`, { minutes });
  return r.data;
}

export async function syncBridgeCefr(payload: {
  clerkId: string;
  cefrLevel: string;
  fluencyScore?: number;
  source?: string;
}): Promise<any> {
  if (!INTERNAL_SECRET) {
    warnBridgeSecretMissing();
    return null;
  }
  const r = await bridgeClient.patch("/sync/cefr", payload);
  return r.data;
}
