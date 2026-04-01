import axios from "axios";
import { Platform } from "react-native";
import Constants from "expo-constants";

const IS_PROD = !__DEV__;
const FORCE_LOCAL = false;

const LOCAL_IP = "192.168.1.34";
const LOCAL_PORT = "3000";
const isDevice = Constants.isDevice;

const EXTRA_API_URL_OVERRIDE =
  (Constants.expoConfig as any)?.extra?.apiUrlOverride ||
  (Constants.manifest as any)?.extra?.apiUrlOverride ||
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
          // iOS simulator
          if (Platform.OS === 'ios') return 'http://localhost:3000';
          // Android emulator
          if (isDevice === false) return 'http://10.0.2.2:3000';
          // Physical device (both platforms)
          return `http://${LOCAL_IP}:${LOCAL_PORT}`;
        })());

if (__DEV__) console.log('[Englivo API] Resolved URL:', API_URL);

export const client = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
    "X-Client": "app",
  },
  timeout: 90000,
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

if (__DEV__) {
  client.interceptors.response.use(
    (response) => {
      console.log(`[Englivo API] ${response.config.method?.toUpperCase()} ${response.config.url} → ${response.status}`);
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

const buildBridgeBaseUrl = (apiUrl: string): string => {
  // Convert `http(s)://host[:port]` -> `http(s)://host:3012`
  const trimmed = apiUrl.replace(/\/$/, "");
  if (trimmed.match(/:\d+$/)) return trimmed.replace(/:\d+$/, ":3012");
  return `${trimmed}:3012`;
};

export const bridgeApi = axios.create({
  baseURL: buildBridgeBaseUrl(API_URL),
  headers: {
    "Content-Type": "application/json",
    "X-Client": "app",
  },
  timeout: 90000,
});

// Share the same token fetcher with the bridge client.
bridgeApi.interceptors.request.use(
  async (config) => {
    if (getToken) {
      try {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        } else {
          console.warn(
            `[Englivo Bridge API] getToken returned null for URL: ${config.url}`,
          );
        }
      } catch (e) {
        console.error(
          `[Englivo Bridge API] Failed to retrieve token for URL: ${config.url}:`,
          e,
        );
      }
    } else {
      console.warn(
        `[Englivo Bridge API] No token fetcher configured yet! URL: ${config.url}`,
      );
    }
    return config;
  },
  (error) => Promise.reject(error),
);

if (__DEV__) {
  bridgeApi.interceptors.response.use(
    (response) => {
      console.log(
        `[Englivo Bridge API] ${response.config.method?.toUpperCase()} ${response.config.url} → ${response.status}`,
      );
      return response;
    },
    (error) => {
      console.error(
        `[Englivo Bridge API] Error ${error.response?.status} on ${error.config?.url}:`,
        error.response?.data,
      );
      return Promise.reject(error);
    },
  );
}
