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

// Access localhost from emulator/device or use production URL
const IS_PROD = !__DEV__;
// For EAS distribution build set to false so the app uses the production API URL.
// For EAS distribution builds, ALWAYS set this to false.
// Use true only for temporary local testing on a physical device.
const FORCE_LOCAL = false;

// Local dev default: docker-compose exposes Nest on 3000.
// If you override `EXPO_PUBLIC_NEST_API_URL`/`APP_API_URL_OVERRIDE`, that URL (and its port)
// will be used instead.
const LOCAL_PORT = 3000;
const isDevice = Constants.isDevice;

// Dev fallback host for Nest: prefer bundle script origin (tracks hotspot / Wi‑Fi), then Expo hostUri.
const _hostUri: string | undefined = (Constants.expoConfig as { hostUri?: string } | null)
  ?.hostUri;
const DEV_BUNDLE_HOST = getDevBundleHostname();
const LOCAL_IP =
  DEV_BUNDLE_HOST ||
  (_hostUri ? _hostUri.split(":")[0] : undefined) ||
  "172.20.10.13";

// Nest base URL overrides (same host for REST + Socket.IO `/chat`):
// 1) EXPO_PUBLIC_NEST_API_URL — inlined when Metro bundles; set in .env.local and reload (best when LAN IP changes often).
// 2) extra.apiUrlOverride — from app.config.js via APP_API_URL_OVERRIDE (.env / EAS); read from manifest fallback too.
const nestUrlFromPublicEnv =
  typeof process.env.EXPO_PUBLIC_NEST_API_URL === "string"
    ? process.env.EXPO_PUBLIC_NEST_API_URL.trim()
    : "";
const nestUrlFromExtra = (readExpoExtra("apiUrlOverride") ?? "").trim();
const DEV_REWRITTEN_NEST_OVERRIDE = rewriteDevLanOverride(
  nestUrlFromPublicEnv || nestUrlFromExtra || null,
  DEV_BUNDLE_HOST,
  "Nest API",
);
const EXTRA_API_URL_OVERRIDE = coerceReleaseApiOverride(
  DEV_REWRITTEN_NEST_OVERRIDE,
  "Nest API",
);

// Determine the API URL based on environment.
// Production builds (IS_PROD=true) will ALWAYS use the production URL.
export const API_URL =
  // 0) Explicit override wins (useful for EAS internal builds pointing to local backend)
  (typeof EXTRA_API_URL_OVERRIDE === "string" && EXTRA_API_URL_OVERRIDE.trim()
    ? EXTRA_API_URL_OVERRIDE.trim()
    : null) ||
  // 1) Default behavior
  (IS_PROD
    ? (process.env.EXPO_PUBLIC_NEST_API_URL || (() => { console.error("[EngR] EXPO_PUBLIC_NEST_API_URL not set — production requests will fail"); return ""; })())
    : FORCE_LOCAL
      ? `http://${LOCAL_IP}:${LOCAL_PORT}`
      : Platform.select({
          // Simulator: localhost. Physical iPhone: host machine LAN IP.
          ios:
            isDevice === false
              ? `http://localhost:${LOCAL_PORT}`
              : `http://${LOCAL_IP}:${LOCAL_PORT}`,
          // Emulator: 10.0.2.2 = host loopback. Physical Android: LAN IP (10.0.2.2 will always fail).
          android:
            isDevice === false
              ? `http://10.0.2.2:${LOCAL_PORT}`
              : `http://${LOCAL_IP}:${LOCAL_PORT}`,
          default: `http://${LOCAL_IP}:${LOCAL_PORT}`,
        }));

if (__DEV__) {
  console.log(`[API] Initializing client with URL: ${API_URL}`);
} else {
  // Release builds: visible in Xcode / `adb logcat` when debugging connectivity
  console.warn(`[EngR] Nest API base URL: ${API_URL}`);
}

export const client = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 90000, // 90s timeout for Render cold start + AI processing
});

let getToken: (() => Promise<string | null>) | null = null;

export const setAuthTokenFetcher = (fetcher: () => Promise<string | null>) => {
  getToken = fetcher;
};

/** Session JWT for Nest `client` (same source as the axios auth interceptor). */
export async function getNestAuthToken(): Promise<string | null> {
  if (!getToken) return null;
  try {
    return await getToken();
  } catch {
    return null;
  }
}

client.interceptors.request.use(
  async (config) => {
    if (getToken) {
      try {
        const token = await getCachedToken(getToken);
        if (token) {
          // console.log('[API] Attaching auth token');
          config.headers.Authorization = `Bearer ${token}`;
        } else {
          console.warn(
            `[API] getToken returned null for URL: ${config.url} - request sent without Auth header`,
          );
        }
      } catch (e) {
        console.error(
          `[API] Failed to retrieve token for URL: ${config.url}:`,
          e,
        );
      }
    } else {
      console.warn(`[API] No token fetcher configured yet! URL: ${config.url}`);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

client.interceptors.response.use(
  (response) => {
    if (__DEV__) {
      console.log(
        `[NestJS API] ${response.config.method?.toUpperCase()} ${response.config.url} -> ${response.status}`,
      );
    }
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const path = error.config?.url ?? "";
    const base = error.config?.baseURL ?? "";
    const data = error.response?.data;
    console.warn(
      `[EngR API] ${status ?? "network"} ${base}${path}`,
      typeof data === "object" ? JSON.stringify(data) : data ?? error.message,
    );
    return Promise.reject(error);
  },
);

/** Conversation session counts — Core `GET /api/sessions/count`. */
export async function getSessionsCount(): Promise<number> {
  const r = await client.get<{ count?: number } | number>("/api/sessions/count");
  const payload = r.data as any;
  if (typeof payload === "number") return payload;
  return Number(payload?.count ?? 0);
}

/** Next scheduled peer session — Core `GET /api/sessions/upcoming`. */
export async function getUpcomingSession(): Promise<any | null> {
  try {
    const r = await client.get("/api/sessions/upcoming");
    return r.data;
  } catch (error: any) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}
