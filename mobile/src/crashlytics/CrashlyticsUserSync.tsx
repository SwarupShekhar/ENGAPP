import { useEffect } from "react";
import { useUser } from "@clerk/clerk-expo";
import { Platform } from "react-native";
import { setCrashlyticsUserId } from "./crashlytics";

/** Links Clerk user id to Crashlytics crash reports (native only). */
export function CrashlyticsUserSync() {
  const { user } = useUser();

  useEffect(() => {
    if (Platform.OS === "web") return;
    void setCrashlyticsUserId(user?.id ?? null);
  }, [user?.id]);

  return null;
}
