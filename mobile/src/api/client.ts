import axios, { type AxiosInstance } from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
import {
  coerceReleaseApiOverride,
  rewriteDevLanOverride,
} from "./releaseUrlOverride";
import { readExpoExtra } from "./expoExtra";
import { getDevBundleHostname } from "./devPackagerHost";
import { getCachedToken } from "./authToken";

/**
 * EngR / Pulse API client → Nest (matchmaking, P2P sessions, Maya tutor REST, home).
 * Production: EXPO_PUBLIC_NEST_API_URL or Vultr :4001.
 * Englivo booking/quota uses englivoClient.ts → englivo.com (Option A).
 * Same Clerk instance + Bridge API for shared CEFR/streak across modes.
 */
const IS_PROD = !__DEV__;
// For EAS distribution build set to false so the app uses the production API URL.
// For EAS distribution builds, ALWAYS set this to false.
// Use true only for temporary local testing on a physical device.
const FORCE_LOCAL = false;

// Local dev default: docker-compose exposes Nest on 3000.
const LOCAL_PORT = 3000;
const isDevice = Constants.isDevice;

const _hostUri: string | undefined = (Constants.expoConfig as { hostUri?: string } | null)
  ?.hostUri;
const DEV_BUNDLE_HOST = getDevBundleHostname();
const LOCAL_IP =
  DEV_BUNDLE_HOST ||
  (_hostUri ? _hostUri.split(":")[0] : undefined) ||
  "172.20.10.13";

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

export const API_URL =
  (typeof EXTRA_API_URL_OVERRIDE === "string" && EXTRA_API_URL_OVERRIDE.trim()
    ? EXTRA_API_URL_OVERRIDE.trim()
    : null) ||
  (IS_PROD
    ? (process.env.EXPO_PUBLIC_NEST_API_URL || (() => { console.error("[EngR] EXPO_PUBLIC_NEST_API_URL not set — production requests will fail"); return ""; })())
    : FORCE_LOCAL
      ? `http://${LOCAL_IP}:${LOCAL_PORT}`
      : Platform.select({
          ios:
            isDevice === false
              ? `http://localhost:${LOCAL_PORT}`
              : `http://${LOCAL_IP}:${LOCAL_PORT}`,
          android:
            isDevice === false
              ? `http://10.0.2.2:${LOCAL_PORT}`
              : `http://${LOCAL_IP}:${LOCAL_PORT}`,
          default: `http://${LOCAL_IP}:${LOCAL_PORT}`,
        }));

/** Home, matchmaking, sessions list — fail fast (200–500 ms SLO). */
export const FAST_API_TIMEOUT_MS = 5000;

/** Maya tutor, assessment audio, TTS proxy — allow AI pipeline time. */
export const AI_API_TIMEOUT_MS = 90000;

if (__DEV__) {
  console.log(`[API] Nest base URL: ${API_URL}`);
} else {
  console.warn(`[EngR] Nest API base URL: ${API_URL}`);
}

let getToken: (() => Promise<string | null>) | null = null;

export const setAuthTokenFetcher = (fetcher: () => Promise<string | null>) => {
  getToken = fetcher;
};

/** Session JWT for Nest axios clients (same source as the auth interceptor). */
export async function getNestAuthToken(): Promise<string | null> {
  if (!getToken) return null;
  try {
    return await getToken();
  } catch {
    return null;
  }
}

function attachNestInterceptors(instance: AxiosInstance): void {
  instance.interceptors.request.use(
    async (config) => {
      if (getToken) {
        try {
          const token = await getCachedToken(getToken);
          if (token) {
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
    (error) => Promise.reject(error),
  );

  instance.interceptors.response.use(
    (response) => {
      if (__DEV__) {
        const tag =
          response.config.timeout === FAST_API_TIMEOUT_MS ? "fast" : "ai";
        console.log(
          `[NestJS API:${tag}] ${response.config.method?.toUpperCase()} ${response.config.url} -> ${response.status}`,
        );
      }
      return response;
    },
    (error) => {
      const status = error.response?.status;
      const path = error.config?.url ?? "";
      const base = error.config?.baseURL ?? "";
      const data = error.response?.data;
      const isTimeout =
        error.code === "ECONNABORTED" ||
        String(error.message ?? "").toLowerCase().includes("timeout");
      console.warn(
        `[EngR API] ${status ?? (isTimeout ? "timeout" : "network")} ${base}${path}`,
        typeof data === "object" ? JSON.stringify(data) : data ?? error.message,
      );
      return Promise.reject(error);
    },
  );
}

function createNestClient(timeoutMs: number): AxiosInstance {
  const instance = axios.create({
    baseURL: API_URL,
    headers: {
      "Content-Type": "application/json",
    },
    timeout: timeoutMs,
  });
  attachNestInterceptors(instance);
  return instance;
}

/** Fast Nest client — home, matchmaking, chat REST, onboarding. */
export const fastClient = createNestClient(FAST_API_TIMEOUT_MS);

/** Long-timeout Nest client — tutor, assessment submit, TTS, practice assess. */
export const aiClient = createNestClient(AI_API_TIMEOUT_MS);

/**
 * Default export: fast client. Import `aiClient` explicitly for AI-heavy routes.
 * Per-request `timeout` in axios config still overrides the instance default.
 */
export const client = fastClient;

/** Conversation session counts — Core `GET /sessions/count`. */
export async function getSessionsCount(): Promise<number> {
  const r = await client.get<{ count?: number } | number>("/sessions/count");
  const payload = r.data as any;
  if (typeof payload === "number") return payload;
  return Number(payload?.count ?? 0);
}

/** Next scheduled peer session — Core `GET /sessions/upcoming`. */
export async function getUpcomingSession(): Promise<any | null> {
  try {
    const r = await client.get("/sessions/upcoming");
    const data = r.data;
    if (data == null) return null;
    if (Array.isArray(data)) return data.length > 0 ? data[0] : null;
    return data;
  } catch (error: any) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}
