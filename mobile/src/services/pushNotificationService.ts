import Pushy from 'pushy-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { tokenCache } from '../utils/tokenCache';
import { navigate } from '../navigation/navigationRef';

const STORAGE_KEY = '@pushy_device_token';
const PUSHY_ENABLED_KEY = '@pushy_enabled';

class PushNotificationService {
  private static instance: PushNotificationService;
  private isInitialized = false;
  private listeners: Array<(data: any) => void> = [];
  private clickListeners: Array<(data: any) => void> = [];

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

    try {
      console.log('[Pushy] Initializing SDK...');
      Pushy.listen();

      Pushy.setNotificationListener(async (data) => {
        console.log('[Pushy] Received notification:', JSON.stringify(data));
        this.listeners.forEach((cb) => cb(data));

        if (Platform.OS === 'android') {
          const title = data.title || 'EngR';
          const message = data.message || data.body || 'New notification';
          Pushy.notify(title, message, data);
        }

        if (Platform.OS === 'ios') {
          Pushy.setBadge(0);
        }
      });

      Pushy.setNotificationClickListener(async (data) => {
        console.log('[Pushy] Notification clicked:', JSON.stringify(data));
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
      const authToken = await tokenCache.getToken();
      if (!authToken) {
        console.warn('[Pushy] No auth token available, skipping backend registration');
        return;
      }

      const { client } = await import('../api/client');

      await client.post('/users/me/device-token', {
        deviceToken: token,
        platform: Platform.OS,
        pushProvider: 'pushy',
      });

      console.log('[Pushy] Token sent to backend successfully');
    } catch (error: any) {
      console.error('[Pushy] Failed to send token to backend:', error.message || error);
      await AsyncStorage.setItem('@pushy_pending_token', token);
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
      await Pushy.unregister();
      await AsyncStorage.removeItem(STORAGE_KEY);
      await this.setPushEnabled(false);

      try {
        const authToken = await tokenCache.getToken();
        if (authToken) {
          const { client } = await import('../api/client');
          await client.delete('/users/me/device-token');
        }
      } catch (e: any) {
        console.warn('[Pushy] Failed to remove token from backend:', e.message);
      }

      console.log('[Pushy] Unregistered successfully');
    } catch (error: any) {
      console.error('[Pushy] Unregistration failed:', error.message || error);
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

  onNotification(callback: (data: any) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  onNotificationClick(callback: (data: any) => void): () => void {
    this.clickListeners.push(callback);
    return () => {
      this.clickListeners = this.clickListeners.filter((cb) => cb !== callback);
    };
  }

  private handleNotificationClick(data: any): void {
    const { type, sessionId, conversationId } = data;
    console.log('[Pushy] Navigating based on notification type:', type);

    switch (type) {
      case 'message':
        navigate('Chat', { conversationId });
        break;
      case 'match':
        navigate('CallPreference');
        break;
      case 'session_ready':
        navigate('AssessmentResult', { sessionId });
        break;
      case 'milestone':
        navigate('MainTabs', { screen: 'Progress' });
        break;
      case 'reminder':
      case 'streak_risk':
        navigate('MainTabs', { screen: 'Home' });
        break;
      default:
        navigate('MainTabs');
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
