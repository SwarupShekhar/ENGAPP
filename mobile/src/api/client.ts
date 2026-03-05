import axios from "axios";
import { useAuth } from "@clerk/clerk-expo";
import { Platform } from "react-native";
import Constants from "expo-constants";

// Access localhost from emulator/device or use production URL
const IS_PROD = !__DEV__;
const FORCE_LOCAL = true; // Set to true to force LOCAL backend even in prod builds

// Your Mac's local IP address on the Wi-Fi network
const LOCAL_IP = "192.168.1.34";

// When FORCE_LOCAL is true, always connect to your Mac's IP directly.
// This works for physical devices, emulators, and iOS simulators.
export const API_URL = FORCE_LOCAL
  ? `http://${LOCAL_IP}:3000`
  : IS_PROD
    ? "https://engapp-3210.onrender.com"
    : Platform.select({
        ios: "http://localhost:3000",
        android: "http://10.0.2.2:3000",
        default: `http://${LOCAL_IP}:3000`,
      });

console.log(`[API] Initializing client with URL: ${API_URL}`);

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
            "[API] getToken returned null - request sent without Auth header",
          );
        }
      } catch (e) {
        console.error("[API] Failed to retrieve token:", e);
      }
    } else {
      console.warn("[API] No token fetcher configured");
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);
