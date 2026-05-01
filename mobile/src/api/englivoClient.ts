import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { client as nestClient } from "./client";
import { coerceReleaseApiOverride } from "./releaseUrlOverride";

const IS_PROD = !__DEV__;
// Set to true only when you intentionally run backend-ai locally with matching routes.
const FORCE_LOCAL = false;

const LOCAL_IP = "192.168.1.34";
/** backend-ai (FastAPI) local port — not Nest (3000/3002). */
const LOCAL_PORT = "8001";
const isDevice = Constants.isDevice;

const EXTRA_API_URL_OVERRIDE = coerceReleaseApiOverride(
  (Constants.expoConfig as any)?.extra?.englivoApiUrlOverride ||
    (Constants.manifest as any)?.extra?.englivoApiUrlOverride,
  "Englivo API",
);

// Production: Englivo AI (FastAPI on Render). Nest still serves core session APIs — see client.ts.
// Default in dev now points to production to avoid missing local routes.
export const API_URL =
  (typeof EXTRA_API_URL_OVERRIDE === "string" && EXTRA_API_URL_OVERRIDE.trim()
    ? EXTRA_API_URL_OVERRIDE.trim()
    : null) ||
  (IS_PROD || !FORCE_LOCAL
    ? "https://englivo.com"
    : (() => {
        if (Platform.OS === "ios") {
          return isDevice === false
            ? `http://localhost:${LOCAL_PORT}`
            : `http://${LOCAL_IP}:${LOCAL_PORT}`;
        }
        if (isDevice === false) return `http://10.0.2.2:${LOCAL_PORT}`;
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
let _loggedJwtIss = false;

export const setAuthTokenFetcher = (fetcher: () => Promise<string | null>) => {
  getToken = fetcher;
};

// Decode JWT payload without verification — used only for diagnostic logging.
function _jwtIss(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.iss ?? null;
  } catch {
    return null;
  }
}

client.interceptors.request.use(
  async (config) => {
    if (getToken) {
      try {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          // One-time diagnostic: log which Clerk instance issued this token
          if (!_loggedJwtIss) {
            _loggedJwtIss = true;
            const iss = _jwtIss(token);
            console.log(`[Englivo API] JWT issuer (iss): ${iss ?? '(unknown)'}`);
            if (iss && !iss.includes('englivo')) {
              console.warn(
                `[Englivo API] ⚠️ Token is from "${iss}" — NOT the englivo.com Clerk instance. ` +
                'Sign out and sign in again to get a fresh token from clerk.englivo.com.',
              );
            }
          }
        } else {
          console.warn(
            `[Englivo API] getToken returned null for URL: ${config.url} — user not signed in`,
          );
        }
      } catch (e) {
        console.error(
          `[Englivo API] Failed to retrieve token for URL: ${config.url}:`,
          e,
        );
      }
    } else if (_authToken) {
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
      const status = error?.response?.status;
      const url = String(error?.config?.url ?? "");
      const data = error?.response?.data;
      // Local backend-ai does not currently expose some Core endpoints.
      // Keep these as warnings so RN dev overlay does not block debugging.
      if (status === 401) {
        _loggedJwtIss = false; // allow re-logging on next request after auth change
        console.error(
          `[Englivo API] 401 on ${url} — Clerk token rejected by englivo.com.`,
          '\n  Check: (1) JWT iss log above matches clerk.englivo.com',
          '\n         (2) "engr:///" added to Clerk Dashboard → Native Applications',
          '\n         (3) Sign out + sign back in to refresh the session',
          data,
        );
      } else if (
        status === 404 &&
        (url.includes("/api/me") || url.includes("/api/livekit/token"))
      ) {
        console.warn(
          `[Englivo API] 404 on ${url} (route not available on local backend-ai)`,
          data,
        );
      } else if (status === 500 || status === 502 || status === 503) {
        // Server-side errors — screens fall back to empty state, so use warn
        // to avoid triggering the RN dev red-box overlay.
        console.warn(
          `[Englivo API] ${status} on ${url} (server error — screen falls back gracefully):`,
          typeof data === 'object' ? JSON.stringify(data) : data,
        );
      } else {
        console.error(
          `[Englivo API] Error ${status} on ${url}:`,
          data,
        );
      }
      return Promise.reject(error);
    },
  );
}
