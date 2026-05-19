import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/** Clerk token storage — SecureStore on native, localStorage on web (SecureStore is not available on web). */
export const tokenCache = {
  async getToken(key: string) {
    try {
      if (Platform.OS === "web") {
        return typeof localStorage !== "undefined"
          ? localStorage.getItem(key)
          : null;
      }
      return SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      if (Platform.OS === "web") {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(key, value);
        }
        return;
      }
      return SecureStore.setItemAsync(key, value);
    } catch {
      return;
    }
  },
};
