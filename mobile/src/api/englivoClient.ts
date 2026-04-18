import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { client as nestClient } from "./client";
import { coerceReleaseApiOverride } from "./releaseUrlOverride";

const IS_PROD = !__DEV__;
const FORCE_LOCAL = false;

const LOCAL_IP = "192.168.1.34";
const LOCAL_PORT = "3000";
const isDevice = Constants.isDevice;

const EXTRA_API_URL_OVERRIDE = coerceReleaseApiOverride(
  (Constants.expoConfig as any)?.extra?.englivoApiUrlOverride ||
    (Constants.manifest as any)?.extra?.englivoApiUrlOverride,
  "Englivo API",
);

// Production: Englivo AI (FastAPI on Render). Nest still serves core session APIs — see client.ts.
export const API_URL =
  (typeof EXTRA_API_URL_OVERRIDE === "string" && EXTRA_API_URL_OVERRIDE.trim()
    ? EXTRA_API_URL_OVERRIDE.trim()
    : null) ||
  (IS_PROD
    ? "https://englivo-ai.onrender.com"
    : FORCE_LOCAL
      ? `http://${LOCAL_IP}:${LOCAL_PORT}`
      : (() => {
          if (Platform.OS === "ios") return "http://localhost:3000";
          if (isDevice === false) return "http://10.0.2.2:3000";
          return `http://${LOCAL_IP}:${LOCAL_PORT}`;
        })());

if (__DEV__) console.log("[Englivo API] Resolved URL:", API_URL);

export const client = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
    "X-Client": "app",
  },
  timeout: 90000,
});

// ── Auth pattern 1: static token string (set from top-level hook) ──────────────
// Use setEnglivoAuthToken() from a component that has Clerk hook access.
let _authToken: string | null = null;

export const setEnglivoAuthToken = (token: string | null) => {
  _authToken = token;
};

// ── Auth pattern 2: async fetcher (preferred — always gets a fresh token) ──────
// App.tsx wires this via AuthTokenInjector on startup.
let getToken: (() => Promise<string | null>) | null = null;

export const setAuthTokenFetcher = (fetcher: () => Promise<string | null>) => {
  getToken = fetcher;
};

client.interceptors.request.use(
  async (config) => {
    if (getToken) {
      try {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        } else {
          console.warn(
            `[Englivo API] getToken returned null for URL: ${config.url}`,
          );
        }
      } catch (e) {
        console.error(
          `[Englivo API] Failed to retrieve token for URL: ${config.url}:`,
          e,
        );
      }
    } else if (_authToken) {
      // Fallback to static token if fetcher not configured yet
      config.headers.Authorization = `Bearer ${_authToken}`;
    } else {
      console.warn(`[Englivo API] No token configured yet! URL: ${config.url}`);
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/** Conversation session counts — NestJS `GET /sessions/count` (not Englivo `/api`). */
export async function getSessionsCount(): Promise<number> {
  const r = await nestClient.get<{ count: number }>("/sessions/count");
  return r.data.count;
}

/** Next scheduled peer session — NestJS `GET /sessions/upcoming`. */
export async function getUpcomingSession(): Promise<any | null> {
  try {
    const r = await nestClient.get("/sessions/upcoming");
    return r.data;
  } catch (error: any) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}

if (__DEV__) {
  client.interceptors.response.use(
    (response) => {
      console.log(
        `[Englivo API] ${response.config.method?.toUpperCase()} ${response.config.url} -> ${response.status}`,
      );
      return response;
    },
    (error) => {
      console.error(
        `[Englivo API] Error ${error.response?.status} on ${error.config?.url}:`,
        error.response?.data,
      );
      return Promise.reject(error);
    },
  );
}
