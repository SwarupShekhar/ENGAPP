import Pushy from "pushy-react-native";
import type { PushyPayload } from "pushy-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { client, getNestAuthToken } from "../api/client";
import { navigate } from "../navigation/navigationRef";

const STORAGE_KEY = '@pushy_device_token';
const PUSHY_ENABLED_KEY = '@pushy_enabled';

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
    if (this.isInitialized) {
      console.log('[Pushy] Already initialized');
      return;
    }

    if (Pushy == null || typeof (Pushy as { listen?: () => void }).listen !== "function") {
      console.warn(
        "[Pushy] Native module not linked. Rebuild the dev client after adding pushy-expo-plugin (npx expo prebuild --clean, then expo run:android / EAS). Skipping push init.",
      );
      return;
    }

    try {
      console.log('[Pushy] Initializing SDK...');
      Pushy.listen();

      Pushy.setNotificationListener(async (data) => {
        console.log("[Pushy] Received notification:", JSON.stringify(data));
        this.listeners.forEach((cb) => cb(data));

        if (Platform.OS === "android") {
          const title = (data.title as string) || "EngR";
          const message =
            (data.message as string) || (data.body as string) || "New notification";
          Pushy.notify(title, message, data);
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
      console.log('[Pushy] Initialized successfully');
    } catch (error: any) {
      console.error('[Pushy] Initialization failed:', error.message || error);
    }
  }

  async registerDevice(): Promise<void> {
    try {
      const enabled = await this.isPushEnabled();
      if (enabled === false) {
        console.log('[Pushy] Push notifications disabled by user');
        return;
      }

      const deviceToken = await Pushy.register();
      console.log('[Pushy] Device token:', deviceToken);

      await AsyncStorage.setItem(STORAGE_KEY, deviceToken);
      await this.sendTokenToBackend(deviceToken);

      const update = await Pushy.checkForUpdate();
      if (update.available) {
        console.log('[Pushy] Update available:', update);
      }

      const badge = await Pushy.getBadge();
      console.log('[Pushy] Current badge count:', badge);
    } catch (error: any) {
      if (error.message?.includes('permission') || error.message?.includes('denied')) {
        console.warn('[Pushy] User denied push notification permissions');
        await this.setPushEnabled(false);
      } else if (error.message?.includes('network') || error.message?.includes('Network')) {
        console.warn('[Pushy] Network error during registration:', error.message);
      } else {
        console.error('[Pushy] Registration failed:', error.message || error);
      }
    }
  }

  private async sendTokenToBackend(token: string): Promise<void> {
    try {
      const authToken = await getNestAuthToken();
      if (!authToken) {
        console.warn("[Pushy] No auth token available, skipping backend registration");
        return;
      }

      const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "android";

      await client.post("/users/me/device-token", {
        deviceToken: token,
        platform,
        pushProvider: "pushy",
      });

      console.log("[Pushy] Token sent to backend successfully");
    } catch (error: any) {
      console.error("[Pushy] Failed to send token to backend:", error.message || error);
      await AsyncStorage.setItem("@pushy_pending_token", token);
    }
  }

  async retryPendingToken(): Promise<void> {
    try {
      const pendingToken = await AsyncStorage.getItem('@pushy_pending_token');
      if (pendingToken) {
        await this.sendTokenToBackend(pendingToken);
        await AsyncStorage.removeItem('@pushy_pending_token');
      }
    } catch (error: any) {
      console.error('[Pushy] Failed to retry pending token:', error.message || error);
    }
  }

  async getDeviceToken(): Promise<string | null> {
    return await AsyncStorage.getItem(STORAGE_KEY);
  }

  async unregister(): Promise<void> {
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
      } catch (e: any) {
        console.warn("[Pushy] Failed to remove token from backend:", e.message);
      }

      await AsyncStorage.removeItem(STORAGE_KEY);
      // Do not call setPushEnabled(false) here — it calls unregister() and would recurse.
      await AsyncStorage.setItem(PUSHY_ENABLED_KEY, "false");

      console.log("[Pushy] Unregistered successfully");
    } catch (error: any) {
      console.error("[Pushy] Unregistration failed:", error.message || error);
    }
  }

  async isPushEnabled(): Promise<boolean> {
    const value = await AsyncStorage.getItem(PUSHY_ENABLED_KEY);
    return value !== 'false';
  }

  async setPushEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(PUSHY_ENABLED_KEY, enabled.toString());
    if (enabled) {
      await this.registerDevice();
    } else {
      await this.unregister();
    }
  }

  async setBadge(count: number): Promise<void> {
    if (Platform.OS === 'ios') {
      Pushy.setBadge(count);
    }
  }

  async getBadge(): Promise<number> {
    if (Platform.OS === 'ios') {
      return await Pushy.getBadge();
    }
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
      console.warn('[Pushy] No device token available');
      return;
    }
    console.log('[Pushy] Test notification would be sent to:', token);
  }
}

export default PushNotificationService;
