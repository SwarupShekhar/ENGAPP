import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { userApi } from "../api/user";
import PushNotificationService from "../services/pushNotificationService";

export function useTestPushNotification() {
  const [sending, setSending] = useState(false);

  const sendTest = useCallback(async () => {
    setSending(true);
    try {
      const pushEnabled = await PushNotificationService.getInstance().isPushEnabled();
      if (!pushEnabled) {
        Alert.alert(
          "Push disabled",
          "Turn on Push Notifications above, then try again.",
        );
        return;
      }

      const result = await userApi.sendTestNotification();

      if (!result.pushConfigured) {
        Alert.alert(
          "Server not configured",
          "FCM is not set up on the backend yet. Add FIREBASE_SERVICE_ACCOUNT_JSON to backend-nest/.env and restart the server.",
        );
        return;
      }

      if (result.deviceTokens === 0) {
        Alert.alert(
          "No device registered",
          "This phone has not registered for push yet. Sign in, allow notifications, then try again.",
        );
        return;
      }

      if (!result.ok || result.delivered === 0) {
        Alert.alert(
          "Delivery failed",
          "A device token is registered but FCM could not deliver. Try toggling push off and on, then rebuild the app if needed.",
        );
        return;
      }

      Alert.alert(
        "Test sent",
        "Check your notification tray. If the app is open, you should see a banner at the top.",
      );
    } catch (error) {
      console.error("[FCM] Test notification failed:", error);
      Alert.alert(
        "Could not send",
        "The test notification request failed. Check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  }, []);

  return { sendTest, sending };
}
