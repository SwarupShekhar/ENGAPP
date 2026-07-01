import AsyncStorage from "@react-native-async-storage/async-storage";
import FeedPrefetchService from "./feedPrefetchService";
import {
  APP_CACHE_SCHEMA_KEY,
  APP_CACHE_SCHEMA_VERSION,
  DAILY_CONTENT_CACHE_PREFIX,
  HOME_DATA_CACHE_KEY,
  LEGACY_CACHE_KEYS,
} from "./cacheKeys";

/**
 * Clears stale AsyncStorage caches when the app ships a new schema version.
 * Call once on startup before reading home/eBites caches.
 */
export async function migrateAppCaches(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(APP_CACHE_SCHEMA_KEY);
    const version = stored ? Number.parseInt(stored, 10) : 0;
    if (Number.isFinite(version) && version >= APP_CACHE_SCHEMA_VERSION) {
      return;
    }

    const allKeys = await AsyncStorage.getAllKeys();
    const dailyKeys = allKeys.filter((k) =>
      k.startsWith(DAILY_CONTENT_CACHE_PREFIX),
    );
    await AsyncStorage.multiRemove([
      ...LEGACY_CACHE_KEYS,
      HOME_DATA_CACHE_KEY,
      ...dailyKeys,
    ]);
    FeedPrefetchService.getInstance().invalidate();
    await AsyncStorage.setItem(
      APP_CACHE_SCHEMA_KEY,
      String(APP_CACHE_SCHEMA_VERSION),
    );
    if (__DEV__) {
      console.log(
        `[CacheMigration] Bumped to v${APP_CACHE_SCHEMA_VERSION}, cleared legacy keys`,
      );
    }
  } catch (e) {
    console.warn("[CacheMigration] Failed:", e);
  }
}
