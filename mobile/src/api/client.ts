import axios from "axios";
import { useAuth } from "@clerk/clerk-expo";
import { Platform } from "react-native";
import Constants from "expo-constants";

// Access localhost from emulator/device or use production URL
const IS_PROD = !__DEV__;
// For EAS distribution build set to false so the app uses the production API URL.
// For EAS distribution builds, ALWAYS set this to false.
// Use true only for temporary local testing on a physical device.
const FORCE_LOCAL = true;

// Your Mac's local IP address on the Wi-Fi network
const LOCAL_IP = "172.20.10.13";

// Determine the API URL based on environment.
// Production builds (IS_PROD=true) will ALWAYS use the production URL.
export const API_URL = IS_PROD
  ? "https://engapp-3210.onrender.com"
  : FORCE_LOCAL
    ? `http://${LOCAL_IP}:3000`
    : Platform.select({
        ios: "http://localhost:3000",
        android: "http://10.0.2.2:3000",
        default: `http://${LOCAL_IP}:3000`,
      });

if (__DEV__) console.log(`[API] Initializing client with URL: ${API_URL}`);

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
