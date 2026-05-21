import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { client, getNestAuthToken } from "../api/client";
import { navigate } from "../navigation/navigationRef";

export type PushyPayload = Record<string, unknown>;

type PushyModule = {
  listen: () => void;
  register: () => Promise<string>;
  unregister: () => Promise<void>;
  notify: (title: string, message: string, data: PushyPayload) => void;
  setBadge: (count: number) => void;
  setNotificationListener: (cb: (data: PushyPayload) => void) => void;
  setNotificationClickListener: (cb: (data: PushyPayload) => void) => void;
};

function loadPushy(): PushyModule | null {
  if (Platform.OS === "web") return null;
  try {
    const mod = require("pushy-react-native");
    return (mod?.default ?? mod) as PushyModule;
  } catch {
    return null;
  }
}

const STORAGE_KEY = "@pushy_device_token";
const PUSHY_ENABLED_KEY = "@pushy_enabled";

function flattenPushPayload(raw: PushyPayload): PushyPayload {
  const nested = raw.notification;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...raw, ...(nested as PushyPayload) };
  }
  return raw;
}

function normalizeNotification(raw: PushyPayload): { title: string; body: string } {
  const payload = flattenPushPayload(raw);
  const type = (payload.type as string | undefined) ?? "default";
  const senderName = (payload.senderName as string | undefined) ?? "Your friend";
  const callerName = (payload.callerName as string | undefined) ?? senderName;
  const preview = (payload.preview as string | undefined) ?? "";
  const explicitTitle = (payload.title as string | undefined)?.trim();
  const explicitBody =
    ((payload.message as string | undefined) ??
      (payload.body as string | undefined) ??
      "").trim();
  if (explicitTitle) {
    return {
      title: explicitTitle,
      body: explicitBody || preview || "Open EngR to view details.",
    };
  }

  switch (type) {
    case "message":
      return {
        title: preview ? `${senderName}: ${preview}` : `${senderName} sent you a message`,
        body: preview || explicitBody || "Open chat to read it.",
      };
    case "friend_request":
      return {
        title: `${senderName} sent a friend request`,
        body: "Tap to view and respond.",
      };
    case "incoming_call":
      return {
        title: `${callerName} is calling you`,
        body: "Tap to open the app and join.",
      };
    case "missed_call":
      return {
        title: `Missed call from ${callerName}`,
        body: "Tap to call back.",
      };
    case "session_ready":
      return {
        title: "Session analysis ready",
        body: explicitBody || "Tap to see your feedback.",
      };
    default:
      return {
        title: explicitTitle || "New notification",
        body: explicitBody || "Open EngR to view details.",
      };
  }
}

class PushNotificationService {
  private static instance: PushNotificationService;
  private isInitialized = false;
  private listeners: Array<(data: PushyPayload) => void> = [];
  private clickListeners: Array<(data: PushyPayload) => void> = [];

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  async initialize(): Promise<void> {
    if (Platform.OS === "web") return;

    if (this.isInitialized) {
      console.log("[Pushy] Already initialized");
      return;
    }

    const Pushy = loadPushy();
    if (Pushy == null || typeof Pushy.listen !== "function") {
      console.warn(
        "[Pushy] Native module not linked. Rebuild the dev client after adding pushy-expo-plugin (npx expo prebuild --clean, then expo run:android / EAS). Skipping push init.",
      );
      return;
    }

    try {
      console.log("[Pushy] Initializing SDK...");
      Pushy.listen();

      Pushy.setNotificationListener(async (data) => {
        const flat = flattenPushPayload(data);
        console.log("[Pushy] Received notification:", JSON.stringify(flat));
        this.listeners.forEach((cb) => cb(flat));
        const normalized = normalizeNotification(flat);

        if (Platform.OS === "android") {
          Pushy.notify(normalized.title, normalized.body, {
            ...flat,
            title: normalized.title,
            body: normalized.body,
            message: normalized.body,
          });
        }

        if (Platform.OS === "ios") {
          Pushy.setBadge(0);
        }
      });

      Pushy.setNotificationClickListener(async (data) => {
        console.log("[Pushy] Notification clicked:", JSON.stringify(data));
        this.clickListeners.forEach((cb) => cb(data));
        this.handleNotificationClick(data);
      });

      await this.registerDevice();

      this.isInitialized = true;
      console.log("[Pushy] Initialized successfully");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Pushy] Initialization failed:", message);
    }
  }

  async registerDevice(): Promise<void> {
    if (Platform.OS === "web") return;

    const Pushy = loadPushy();
    if (!Pushy) return;

    try {
      const enabled = await this.isPushEnabled();
      if (enabled === false) {
        console.log("[Pushy] Push notifications disabled by user");
        return;
      }

      const deviceToken = await Pushy.register();
      console.log("[Pushy] Device token:", deviceToken);

      await AsyncStorage.setItem(STORAGE_KEY, deviceToken);
      await this.sendTokenToBackend(deviceToken);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("permission") || message.includes("denied")) {
        console.warn("[Pushy] User denied push notification permissions");
        await this.setPushEnabled(false);
      } else if (message.includes("network") || message.includes("Network")) {
        console.warn("[Pushy] Network error during registration:", message);
      } else {
        console.error("[Pushy] Registration failed:", message);
      }
    }
  }

  private async sendTokenToBackend(token: string): Promise<void> {
    try {
      const authToken = await getNestAuthToken();
      if (!authToken) {
        console.warn(
          "[Pushy] No auth token available, skipping backend registration",
        );
        return;
      }

      const platform =
        Platform.OS === "ios" || Platform.OS === "android"
          ? Platform.OS
          : "android";

      await client.post("/users/me/device-token", {
        deviceToken: token,
        platform,
        pushProvider: "pushy",
      });

      console.log("[Pushy] Token sent to backend successfully");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Pushy] Failed to send token to backend:", message);
      await AsyncStorage.setItem("@pushy_pending_token", token);
    }
  }

  async retryPendingToken(): Promise<void> {
    if (Platform.OS === "web") return;
    try {
      const pendingToken = await AsyncStorage.getItem("@pushy_pending_token");
      if (pendingToken) {
        await this.sendTokenToBackend(pendingToken);
        await AsyncStorage.removeItem("@pushy_pending_token");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Pushy] Failed to retry pending token:", message);
    }
  }

  async getDeviceToken(): Promise<string | null> {
    return await AsyncStorage.getItem(STORAGE_KEY);
  }

  async unregister(): Promise<void> {
    if (Platform.OS === "web") return;

    const Pushy = loadPushy();
    if (!Pushy) return;

    try {
      const storedToken = await AsyncStorage.getItem(STORAGE_KEY);
      await Pushy.unregister();

      try {
        const authToken = await getNestAuthToken();
        if (authToken && storedToken) {
          await client.delete(
            `/users/me/device-token?token=${encodeURIComponent(storedToken)}`,
          );
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn("[Pushy] Failed to remove token from backend:", message);
      }

      await AsyncStorage.removeItem(STORAGE_KEY);
      await AsyncStorage.setItem(PUSHY_ENABLED_KEY, "false");

      console.log("[Pushy] Unregistered successfully");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Pushy] Unregistration failed:", message);
    }
  }

  async isPushEnabled(): Promise<boolean> {
    const value = await AsyncStorage.getItem(PUSHY_ENABLED_KEY);
    return value !== "false";
  }

  async setPushEnabled(enabled: boolean): Promise<void> {
    if (Platform.OS === "web") return;
    await AsyncStorage.setItem(PUSHY_ENABLED_KEY, enabled.toString());
    if (enabled) {
      await this.registerDevice();
    } else {
      await this.unregister();
    }
  }

  async setBadge(count: number): Promise<void> {
    if (Platform.OS !== "ios") return;
    const Pushy = loadPushy();
    Pushy?.setBadge(count);
  }

  async getBadge(): Promise<number> {
    return 0;
  }

  onNotification(callback: (data: PushyPayload) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  onNotificationClick(callback: (data: PushyPayload) => void): () => void {
    this.clickListeners.push(callback);
    return () => {
      this.clickListeners = this.clickListeners.filter((cb) => cb !== callback);
    };
  }

  private handleNotificationClick(data: PushyPayload): void {
    const type = data.type as string | undefined;
    const sessionId = data.sessionId as string | undefined;
    const conversationId = data.conversationId as string | undefined;
    console.log("[Pushy] Navigating based on notification type:", type);

    switch (type) {
      case "message":
        navigate("Chat", { conversationId });
        break;
      case "friend_request":
        navigate("MainTabs", { screen: "Feedback" });
        break;
      case "incoming_call":
      case "missed_call":
        navigate("Conversations");
        break;
      case "match":
        navigate("CallPreference");
        break;
      case "session_ready":
        navigate("AssessmentResult", { sessionId });
        break;
      case "milestone":
        navigate("MainTabs", { screen: "Progress" });
        break;
      case "reminder":
      case "streak_risk":
        navigate("MainTabs", { screen: "Home" });
        break;
      default:
        navigate("MainTabs");
    }
  }

  async sendTestNotification(): Promise<void> {
    const token = await this.getDeviceToken();
    if (!token) {
      console.warn("[Pushy] No device token available");
      return;
    }
    console.log("[Pushy] Test notification would be sent to:", token);
  }
}

export default PushNotificationService;
