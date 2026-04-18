import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { coerceReleaseApiOverride } from "./releaseUrlOverride";

// Access localhost from emulator/device or use production URL
const IS_PROD = !__DEV__;
// For EAS distribution build set to false so the app uses the production API URL.
// For EAS distribution builds, ALWAYS set this to false.
// Use true only for temporary local testing on a physical device.
const FORCE_LOCAL = false;

// Your Mac's local IP address on the Wi-Fi network
const LOCAL_IP = "192.168.1.34";

// Optional override for internal builds / device testing.
// Optional override: app.config.js `extra.apiUrlOverride` via APP_API_URL_OVERRIDE (.env / EAS).
// Example: "http://192.168.1.34:3000"
const EXTRA_API_URL_OVERRIDE = coerceReleaseApiOverride(
  (Constants.expoConfig as any)?.extra?.apiUrlOverride ||
    (Constants.manifest as any)?.extra?.apiUrlOverride,
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
    ? "https://engapp-3210.onrender.com"
    : FORCE_LOCAL
      ? `http://${LOCAL_IP}:3000`
      : Platform.select({
          ios: "http://localhost:3000",
          android: "http://10.0.2.2:3000",
          default: `http://${LOCAL_IP}:3000`,
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

client.interceptors.request.use(
  async (config) => {
    if (getToken) {
      try {
        const token = await getToken();
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
