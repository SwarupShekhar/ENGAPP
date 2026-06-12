import { useCallback, useState } from "react";
import { Alert, Linking } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import PushNotificationService from "../services/pushNotificationService";

export function usePushNotificationsSetting() {
  const [enabled, setEnabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void PushNotificationService.getInstance()
        .isPushEnabled()
        .then((value) => setEnabled(value));
    }, []),
  );

  const onToggle = useCallback(
    async (next: boolean) => {
      const previous = enabled;
      setEnabled(next);
      setUpdating(true);
      try {
        const push = PushNotificationService.getInstance();
        if (next) {
          await push.initialize();
        }
        await push.setPushEnabled(next);
      } catch (error) {
        setEnabled(previous);
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes("permission")) {
          Alert.alert(
            "Notifications disabled",
            "Allow notifications in system settings to get call and match alerts.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open Settings", onPress: () => void Linking.openSettings() },
            ],
          );
        } else {
          Alert.alert(
            "Could not save",
            "Push notification setting was not updated. Please try again.",
          );
        }
      } finally {
        setUpdating(false);
      }
    },
    [enabled],
  );

  return { enabled, updating, onToggle };
}
