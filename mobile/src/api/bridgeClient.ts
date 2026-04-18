import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { coerceReleaseApiOverride } from "./releaseUrlOverride";

const IS_PROD = !__DEV__;
const LOCAL_IP = "192.168.1.34";
const BRIDGE_PORT = "3012";
const isDevice = Constants.isDevice;

const EXTRA_BRIDGE_URL_OVERRIDE = coerceReleaseApiOverride(
  (Constants.expoConfig as any)?.extra?.bridgeApiUrl ||
    (Constants.manifest as any)?.extra?.bridgeApiUrl,
  "Bridge API",
);
const EXTRA_API_URL_OVERRIDE = coerceReleaseApiOverride(
  (Constants.expoConfig as any)?.extra?.apiUrlOverride ||
    (Constants.manifest as any)?.extra?.apiUrlOverride,
  "Bridge API (from Nest override)",
);

const toBridgeUrlFromApi = (apiUrl: string): string => {
  const trimmed = apiUrl.replace(/\/$/, "");
  if (trimmed.match(/:\d+$/)) return trimmed.replace(/:\d+$/, `:${BRIDGE_PORT}`);
  return `${trimmed}:${BRIDGE_PORT}`;
};

const BRIDGE_API_URL =
  (typeof EXTRA_BRIDGE_URL_OVERRIDE === "string" && EXTRA_BRIDGE_URL_OVERRIDE.trim()
    ? EXTRA_BRIDGE_URL_OVERRIDE.trim()
    : null) ||
  // If app API URL override is configured, keep the same host and switch to Bridge port.
  (typeof EXTRA_API_URL_OVERRIDE === "string" && EXTRA_API_URL_OVERRIDE.trim()
    ? toBridgeUrlFromApi(EXTRA_API_URL_OVERRIDE.trim())
    : null) ||
  (IS_PROD
    ? "https://bridge-api-3m4n.onrender.com"
    : (() => {
        // iOS simulator can use localhost, but physical iOS devices cannot.
        if (Platform.OS === "ios" && isDevice === false) {
          return `http://localhost:${BRIDGE_PORT}`;
        }
        // Android emulator uses 10.0.2.2 host loopback.
        if (Platform.OS === "android" && isDevice === false) {
          return `http://10.0.2.2:${BRIDGE_PORT}`;
        }
        // Physical devices on both platforms should use the LAN IP.
        return `http://${LOCAL_IP}:${BRIDGE_PORT}`;
      })());

if (__DEV__) console.log("[Bridge API] Resolved URL:", BRIDGE_API_URL);
if (__DEV__) console.log("[Bridge API] Internal secret loaded:", Boolean(
  (Constants.expoConfig as any)?.extra?.bridgeInternalSecret
));

const INTERNAL_SECRET =
  (Constants.expoConfig as any)?.extra?.bridgeInternalSecret ||
  process.env.BRIDGE_INTERNAL_SECRET ||
  process.env.EXPO_PUBLIC_BRIDGE_INTERNAL_SECRET ||
  "";

export const hasBridgeInternalSecret = (): boolean => Boolean(INTERNAL_SECRET);
let hasWarnedBridgeReadUnauthorized = false;

const bridgeClient = axios.create({
  baseURL: BRIDGE_API_URL,
  headers: {
    "Content-Type": "application/json",
    ...(INTERNAL_SECRET ? { "x-internal-secret": INTERNAL_SECRET } : {}),
  },
  timeout: 90000,
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
      const token = await getToken();
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
      // Degrade gracefully so home/mode restore can continue with local fallback data.
      return null;
    }
    throw error;
  }
}

export async function updateLastActiveApp(
  clerkId: string,
  app: "PULSE" | "CORE",
): Promise<any> {
  const r = await bridgeClient.patch(`/user/${clerkId}`, { last_active_app: app });
  return r.data;
}

export async function incrementBridgeStreak(clerkId: string): Promise<any> {
  const r = await bridgeClient.patch(`/user/${clerkId}/streak`);
  return r.data;
}

export async function addBridgePracticeMinutes(
  clerkId: string,
  minutes: number,
): Promise<any> {
  const r = await bridgeClient.patch(`/user/${clerkId}/minutes`, { minutes });
  return r.data;
}

export async function syncBridgeCefr(payload: {
  clerkId: string;
  cefrLevel: string;
  fluencyScore?: number;
  source?: string;
}): Promise<any> {
  const r = await bridgeClient.patch("/sync/cefr", payload);
  return r.data;
}
