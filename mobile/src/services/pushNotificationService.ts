import AsyncStorage from "@react-native-async-storage/async-storage";
import { PermissionsAndroid, Platform } from "react-native";
import { captureAnalyticsEvent } from "../analytics/analyticsBridge";
import { AnalyticsEvents } from "../analytics/events";
import { analyticsMeta } from "../analytics/eventMeta";
import { client, getNestAuthToken } from "../api/client";
import { navigate } from "../navigation/navigationRef";
import { patchDailyContentFromPush } from "./dailyContentCache";
import {
  displayForegroundNotification,
  ensureNotificationChannel,
  registerNotifeePressHandler,
  setupNotifeeForegroundPressHandling,
} from "./localNotificationDisplay";

export type PushPayload = Record<string, unknown>;

type FirebaseMessagingModule = typeof import("@react-native-firebase/messaging").default;

const STORAGE_KEY = "@fcm_device_token";
const PUSH_ENABLED_KEY = "@push_enabled";
const LEGACY_PUSHY_TOKEN_KEY = "@pushy_device_token";
const PENDING_TOKEN_KEY = "@fcm_pending_token";

let messagingFactory: FirebaseMessagingModule | null = null;

async function getMessaging(): Promise<FirebaseMessagingModule | null> {
  if (Platform.OS === "web") return null;
  if (!messagingFactory) {
    try {
      const mod = await import("@react-native-firebase/messaging");
      messagingFactory = mod.default;
    } catch {
      return null;
    }
  }
  return messagingFactory;
}

function flattenPushPayload(raw: PushPayload): PushPayload {
  const nested = raw.notification;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...raw, ...(nested as PushPayload) };
  }
  return raw;
}

function payloadFromRemoteMessage(
  message: import("@react-native-firebase/messaging").FirebaseMessagingTypes.RemoteMessage,
): PushPayload {
  const data = (message.data ?? {}) as PushPayload;
  return flattenPushPayload({
    ...data,
    title: data.title ?? message.notification?.title,
    body: data.body ?? message.notification?.body,
    message: data.message ?? message.notification?.body,
  });
}

class PushNotificationService {
  private static instance: PushNotificationService;
  private isInitialized = false;
  private listeners: Array<(data: PushPayload) => void> = [];
  private clickListeners: Array<(data: PushPayload) => void> = [];
  private unsubscribeForeground: (() => void) | null = null;
  private unsubscribeOpened: (() => void) | null = null;
  private unsubscribeTokenRefresh: (() => void) | null = null;

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  async initialize(): Promise<void> {
    if (Platform.OS === "web") return;
    if (this.isInitialized) return;

    const messaging = await getMessaging();
    if (!messaging) {
      console.warn(
        "[FCM] Native module not linked. Rebuild dev client after adding @react-native-firebase/messaging.",
      );
      return;
    }

    try {
      await ensureNotificationChannel();
      registerNotifeePressHandler((data) => this.dispatchClick(data));
      await setupNotifeeForegroundPressHandling();

      this.unsubscribeForeground = messaging().onMessage(async (message) => {
        const flat = payloadFromRemoteMessage(message);
        if (__DEV__) {
          console.log("[FCM] Foreground message:", JSON.stringify(flat));
        }
        await displayForegroundNotification(flat);
        this.dispatchNotification(flat);
      });

      this.unsubscribeOpened = messaging().onNotificationOpenedApp((message) => {
        const flat = payloadFromRemoteMessage(message);
        this.dispatchClick(flat);
      });

      const initial = await messaging().getInitialNotification();
      if (initial) {
        this.dispatchClick(payloadFromRemoteMessage(initial));
      }

      this.unsubscribeTokenRefresh = messaging().onTokenRefresh(async (token) => {
        await AsyncStorage.setItem(STORAGE_KEY, token);
        await this.sendTokenToBackend(token);
      });

      const pushEnabled = await this.isPushEnabled();
      if (pushEnabled !== false) {
        const granted = await this.requestNotificationPermission(messaging);
        if (!granted) {
          await AsyncStorage.setItem(PUSH_ENABLED_KEY, "false");
        } else {
          await this.registerDevice();
        }
      }

      this.isInitialized = true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[FCM] Initialization failed:", message);
    }
  }

  private async requestNotificationPermission(
    messaging: FirebaseMessagingModule,
  ): Promise<boolean> {
    if (Platform.OS === "android" && Platform.Version >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        return false;
      }
    }

    if (Platform.OS === "ios") {
      const status = await messaging().requestPermission();
      return (
        status === messaging.AuthorizationStatus.AUTHORIZED ||
        status === messaging.AuthorizationStatus.PROVISIONAL
      );
    }

    return true;
  }

  async registerDevice(): Promise<void> {
    if (Platform.OS === "web") return;

    const messaging = await getMessaging();
    if (!messaging) return;

    try {
      const enabled = await this.isPushEnabled();
      if (enabled === false) return;

      const deviceToken = await messaging().getToken();
      if (!deviceToken) return;

      await AsyncStorage.setItem(STORAGE_KEY, deviceToken);
      await AsyncStorage.removeItem(LEGACY_PUSHY_TOKEN_KEY);
      await this.sendTokenToBackend(deviceToken);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("permission") || message.includes("denied")) {
        await this.setPushEnabled(false);
      } else {
        console.error("[FCM] Registration failed:", message);
      }
    }
  }

  private async sendTokenToBackend(token: string): Promise<void> {
    try {
      const authToken = await getNestAuthToken();
      if (!authToken) {
        await AsyncStorage.setItem(PENDING_TOKEN_KEY, token);
        return;
      }

      const platform =
        Platform.OS === "ios" || Platform.OS === "android"
          ? Platform.OS
          : "android";

      await client.post("/users/me/device-token", {
        deviceToken: token,
        platform,
        pushProvider: "fcm",
      });

      await AsyncStorage.removeItem(PENDING_TOKEN_KEY);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[FCM] Failed to send token to backend:", message);
      await AsyncStorage.setItem(PENDING_TOKEN_KEY, token);
    }
  }

  async retryPendingToken(): Promise<void> {
    if (Platform.OS === "web") return;
    const pendingToken = await AsyncStorage.getItem(PENDING_TOKEN_KEY);
    if (pendingToken) {
      await this.sendTokenToBackend(pendingToken);
    }
  }

  async getDeviceToken(): Promise<string | null> {
    return AsyncStorage.getItem(STORAGE_KEY);
  }

  async unregister(): Promise<void> {
    if (Platform.OS === "web") return;

    const messaging = await getMessaging();
    if (!messaging) return;

    try {
      const storedToken = await AsyncStorage.getItem(STORAGE_KEY);
      await messaging().deleteToken();

      try {
        const authToken = await getNestAuthToken();
        if (authToken && storedToken) {
          await client.delete(
            `/users/me/device-token?token=${encodeURIComponent(storedToken)}`,
          );
        }
      } catch {
        // best effort
      }

      await AsyncStorage.removeItem(STORAGE_KEY);
      await AsyncStorage.setItem(PUSH_ENABLED_KEY, "false");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[FCM] Unregistration failed:", message);
    }
  }

  async isPushEnabled(): Promise<boolean> {
    const value = await AsyncStorage.getItem(PUSH_ENABLED_KEY);
    return value !== "false";
  }

  async setPushEnabled(enabled: boolean): Promise<void> {
    if (Platform.OS === "web") return;
    await AsyncStorage.setItem(PUSH_ENABLED_KEY, enabled.toString());
    if (enabled) {
      const messaging = await getMessaging();
      if (!messaging) return;

      const granted = await this.requestNotificationPermission(messaging);
      if (!granted) {
        await AsyncStorage.setItem(PUSH_ENABLED_KEY, "false");
        throw new Error("Notification permission denied");
      }

      await this.registerDevice();
    } else {
      await this.unregister();
    }
  }

  async setBadge(_count: number): Promise<void> {
    // Badge counts are handled server-side via APNs for iOS when configured.
  }

  async getBadge(): Promise<number> {
    return 0;
  }

  onNotification(callback: (data: PushPayload) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  onNotificationClick(callback: (data: PushPayload) => void): () => void {
    this.clickListeners.push(callback);
    return () => {
      this.clickListeners = this.clickListeners.filter((cb) => cb !== callback);
    };
  }

  private async syncDailyContentFromPush(data: PushPayload): Promise<void> {
    const type = data.type as string | undefined;
    if (type === "word_of_day" && data.word) {
      await patchDailyContentFromPush({
        wordOfTheDay: {
          word: String(data.word),
          definition: String(data.definition ?? ""),
          example: String(data.example ?? ""),
          partOfSpeech: (data.partOfSpeech as string | undefined) ?? null,
          source: (data.source as string | undefined) ?? undefined,
        },
      });
      return;
    }
    if (type === "phrase_of_day" && data.phrase) {
      await patchDailyContentFromPush({
        phraseOfTheDay: {
          phrase: String(data.phrase),
          definition: String(data.definition ?? ""),
          example: String(data.example ?? ""),
          source: (data.source as string | undefined) ?? undefined,
        },
      });
    }
  }

  private dispatchNotification(data: PushPayload): void {
    void this.syncDailyContentFromPush(data);
    if (data.type === "word_of_day") {
      captureAnalyticsEvent(
        AnalyticsEvents.WORD_OF_DAY_PUSH_RECEIVED,
        analyticsMeta({
          word: (data.word as string | undefined) ?? null,
          source: (data.source as string | undefined) ?? null,
        }),
      );
    }
    if (data.type === "phrase_of_day") {
      captureAnalyticsEvent(
        AnalyticsEvents.PHRASE_OF_DAY_PUSH_RECEIVED,
        analyticsMeta({
          phrase: (data.phrase as string | undefined) ?? null,
        }),
      );
    }
    this.listeners.forEach((cb) => cb(data));
  }

  private dispatchClick(data: PushPayload): void {
    this.clickListeners.forEach((cb) => cb(data));
    this.handleNotificationClick(data);
  }

  private handleNotificationClick(data: PushPayload): void {
    const flat = flattenPushPayload(data);
    const type = flat.type as string | undefined;
    const sessionId = flat.sessionId as string | undefined;
    const conversationId = flat.conversationId as string | undefined;

    void this.syncDailyContentFromPush(flat);

    if (type === "word_of_day") {
      captureAnalyticsEvent(
        AnalyticsEvents.WORD_OF_DAY_PUSH_TAPPED,
        analyticsMeta({
          word: (flat.word as string | undefined) ?? null,
          source: (flat.source as string | undefined) ?? null,
        }),
      );
    }

    if (type === "phrase_of_day") {
      captureAnalyticsEvent(
        AnalyticsEvents.PHRASE_OF_DAY_PUSH_TAPPED,
        analyticsMeta({
          phrase: (flat.phrase as string | undefined) ?? null,
        }),
      );
    }

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
        if (sessionId) {
          navigate("CallFeedback", { sessionId });
        } else {
          navigate("MainTabs", { screen: "Home" });
        }
        break;
      case "milestone":
        navigate("MainTabs", { screen: "Progress" });
        break;
      case "reminder":
      case "streak_risk":
        navigate("MainTabs", { screen: "Home" });
        break;
      case "word_of_day":
        navigate("WordOfDay", {
          word: flat.word as string | undefined,
          definition: flat.definition as string | undefined,
          example: flat.example as string | undefined,
          partOfSpeech: flat.partOfSpeech as string | undefined,
        });
        break;
      case "phrase_of_day":
        navigate("MainTabs", {
          screen: "Home",
          params: { scrollToDaily: "phrase" },
        });
        break;
      default:
        navigate("MainTabs");
    }
  }
}

export default PushNotificationService;
