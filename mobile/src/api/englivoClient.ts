import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";

const IS_PROD = !__DEV__;
const FORCE_LOCAL = false;

const LOCAL_IP = "192.168.1.34";
const LOCAL_PORT = "3000";
const isDevice = Constants.isDevice;

const EXTRA_API_URL_OVERRIDE =
  (Constants.expoConfig as any)?.extra?.englivoApiUrlOverride ||
  (Constants.manifest as any)?.extra?.englivoApiUrlOverride ||
  null;

export const API_URL =
  (typeof EXTRA_API_URL_OVERRIDE === "string" && EXTRA_API_URL_OVERRIDE.trim()
    ? EXTRA_API_URL_OVERRIDE.trim()
    : null) ||
  (IS_PROD
    ? "https://englivo.com"
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

// Separate client for session endpoints that go to NestJS backend
export const sessionClient = axios.create({
  baseURL: API_URL.replace(/:\d+/, ':3004'), // Use port 3004 for NestJS
  headers: {
    "Content-Type": "application/json",
    "X-Client": "app",
  },
  timeout: 90000,
});

// Copy auth interceptor to session client
sessionClient.interceptors.request.use(
  async (config) => {
    if (getToken) {
      try {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        } else {
          console.warn(
            `[Session API] getToken returned null for URL: ${config.url}`,
          );
        }
      } catch (e) {
        console.error(
          `[Session API] Failed to retrieve token for URL: ${config.url}:`,
          e,
        );
      }
    } else {
      console.warn(`[Session API] No token fetcher configured yet! URL: ${config.url}`);
    }
    return config;
  },
  (error) => Promise.reject(error),
);

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
    } else {
      console.warn(`[Englivo API] No token fetcher configured yet! URL: ${config.url}`);
    }
    return config;
  },
  (error) => Promise.reject(error),
);

export async function getSessionsCount(): Promise<number> {
  const r = await sessionClient.get<{ count: number }>("/sessions/count");
  return r.data.count;
}

export async function getUpcomingSession(): Promise<any | null> {
  try {
    const r = await sessionClient.get("/sessions/upcoming");
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

  sessionClient.interceptors.response.use(
    (response) => {
      console.log(
        `[Session API] ${response.config.method?.toUpperCase()} ${response.config.url} -> ${response.status}`,
      );
      return response;
    },
    (error) => {
      console.error(
        `[Session API] Error ${error.response?.status} on ${error.config?.url}:`,
        error.response?.data,
      );
      return Promise.reject(error);
    },
  );
}

