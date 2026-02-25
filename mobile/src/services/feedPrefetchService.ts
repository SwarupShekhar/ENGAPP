/**
 * FeedPrefetchService
 *
 * Singleton that silently prefetches the eBites feed in the background
 * when the app loads. This eliminates the API wait when users tap eBites.
 *
 * Features:
 * - Background preload on app open (with retry)
 * - Persistent AsyncStorage cache (survives app restart)
 * - 5-minute in-memory TTL to avoid redundant API calls
 * - Video URL preloading for the first 2 videos via expo-av
 */
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { reelsApi, Reel, FeedResponse } from "../api/reels";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for in-memory freshness
const STORAGE_KEY = "@ebites_feed_cache";
const PRELOAD_VIDEO_COUNT = 2;
const RETRY_DELAY_MS = 3000; // Retry after 3 seconds if first attempt fails
const MAX_RETRIES = 2;

interface CachedFeed {
  response: FeedResponse;
  timestamp: number;
}

class FeedPrefetchService {
  private static instance: FeedPrefetchService;
  private cache: CachedFeed | null = null;
  private isFetching = false;
  private listeners: Array<() => void> = [];

  static getInstance(): FeedPrefetchService {
    if (!FeedPrefetchService.instance) {
      FeedPrefetchService.instance = new FeedPrefetchService();
    }
    return FeedPrefetchService.instance;
  }

  /**
   * Silently prefetch the feed in the background.
   * Safe to call multiple times — it will skip if already fetching or cache is fresh.
   * Includes retry logic for network failures.
   */
  async prefetch(retryCount = 0): Promise<void> {
    // Skip if already fetching or in-memory cache is still fresh
    if (this.isFetching) return;
    if (this.cache && Date.now() - this.cache.timestamp < CACHE_TTL_MS) {
      console.log("[FeedPrefetch] In-memory cache is still fresh, skipping");
      return;
    }

    // Load from AsyncStorage first (instant, survives restart)
    if (!this.cache) {
      await this.loadFromStorage();
    }

    this.isFetching = true;
    try {
      console.log(
        `[FeedPrefetch] Starting background prefetch (attempt ${retryCount + 1})...`,
      );
      const response = await reelsApi.getFeed();
      this.cache = { response, timestamp: Date.now() };
      console.log(
        `[FeedPrefetch] Prefetched ${response.items?.length || 0} reels`,
      );

      // Persist to AsyncStorage for next app launch
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache));

      // Preload first N video files
      this.preloadVideos(response.items || []);

      // Notify listeners
      this.listeners.forEach((cb) => cb());
    } catch (error) {
      console.warn("[FeedPrefetch] Background prefetch failed:", error);
      // Retry with delay if under max retries
      if (retryCount < MAX_RETRIES) {
        this.isFetching = false;
        setTimeout(() => this.prefetch(retryCount + 1), RETRY_DELAY_MS);
        return;
      }
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Load previously cached feed from AsyncStorage (survives app restart).
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: CachedFeed = JSON.parse(stored);
        // Use stored data regardless of age — it's better than nothing
        this.cache = parsed;
        console.log(
          `[FeedPrefetch] Loaded ${parsed.response.items?.length || 0} reels from AsyncStorage`,
        );
      }
    } catch (e) {
      console.warn("[FeedPrefetch] Failed to load from AsyncStorage:", e);
    }
  }

  /**
   * Get the cached feed if available. Returns null only if no cache exists at all.
   * For staleness, the caller can check the timestamp.
   */
  getCachedFeed(): FeedResponse | null {
    if (!this.cache) return null;
    return this.cache.response;
  }

  /**
   * Force invalidate the cache (e.g., after a session analysis updates weaknesses).
   */
  invalidate(): void {
    this.cache = null;
    AsyncStorage.removeItem(STORAGE_KEY);
    console.log("[FeedPrefetch] Cache invalidated");
  }

  /**
   * Subscribe to cache updates.
   */
  onUpdate(callback: () => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Preload first N video URLs using expo-av to trigger OS-level HTTP cache.
   */
  private async preloadVideos(reels: Reel[]): Promise<void> {
    const videosToPreload = reels
      .filter((r) => r.playback_url)
      .slice(0, PRELOAD_VIDEO_COUNT);

    for (const reel of videosToPreload) {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: reel.playback_url },
          { shouldPlay: false, volume: 0 },
        );
        await sound.unloadAsync();
        console.log(`[FeedPrefetch] Preloaded video: ${reel.title}`);
      } catch (e) {
        console.warn(`[FeedPrefetch] Video preload failed for ${reel.id}`, e);
      }
    }
  }
}

export default FeedPrefetchService;
