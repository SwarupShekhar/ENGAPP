import AsyncStorage from "@react-native-async-storage/async-storage";
import { getNestAuthToken } from "../api/client";
import {
  getHomeData,
  type HomeData,
} from "../features/home/services/homeApi";
import { HOME_DATA_CACHE_KEY, utcTodayKey } from "./cacheKeys";
import {
  getDailyContentForToday,
  mergeDailyPhraseFields,
  mergeDailyWordFields,
  mergeHomeWithDailyContent,
  setDailyContentForToday,
} from "./dailyContentCache";

/**
 * In-memory + disk home snapshot for instant Home paint on cold start.
 * Mirrors FeedPrefetchService pattern.
 */
class HomeCacheService {
  private static instance: HomeCacheService;
  private snapshot: HomeData | null = null;
  private hydratePromise: Promise<HomeData | null> | null = null;
  private prefetchPromise: Promise<void> | null = null;

  static getInstance(): HomeCacheService {
    if (!HomeCacheService.instance) {
      HomeCacheService.instance = new HomeCacheService();
    }
    return HomeCacheService.instance;
  }

  hasSnapshot(): boolean {
    return this.snapshot != null;
  }

  getSnapshot(): HomeData | null {
    return this.snapshot;
  }

  setSnapshot(data: HomeData | null): void {
    this.snapshot = data;
  }

  private async mergeWithDaily(data: HomeData): Promise<HomeData> {
    const datedDaily = await getDailyContentForToday();
    return {
      ...data,
      phraseOfTheDay:
        mergeDailyPhraseFields(datedDaily?.phraseOfTheDay, data.phraseOfTheDay) ??
        data.phraseOfTheDay,
      wordOfTheDay:
        mergeDailyWordFields(datedDaily?.wordOfTheDay, data.wordOfTheDay) ??
        data.wordOfTheDay,
    };
  }

  async hydrateFromDisk(): Promise<HomeData | null> {
    if (this.snapshot) return this.snapshot;
    if (this.hydratePromise) return this.hydratePromise;

    this.hydratePromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(HOME_DATA_CACHE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as HomeData & { _cachedUtcDate?: string };
        const { phraseOfTheDay: _hp, wordOfTheDay: _hw, ...parsedRest } = parsed;
        const datedDaily = await getDailyContentForToday();
        const merged = mergeHomeWithDailyContent(
          parsedRest as unknown as Record<string, unknown>,
          parsed._cachedUtcDate,
          datedDaily,
        ) as unknown as HomeData;
        this.snapshot = await this.mergeWithDaily(merged);
        return this.snapshot;
      } catch (e) {
        console.warn("[HomeCache] hydrate failed:", e);
        return null;
      } finally {
        this.hydratePromise = null;
      }
    })();

    return this.hydratePromise;
  }

  async persistFresh(fresh: HomeData): Promise<HomeData> {
    const withDaily = await this.mergeWithDaily(fresh);
    this.snapshot = withDaily;
    await setDailyContentForToday({
      phraseOfTheDay: fresh.phraseOfTheDay ?? null,
      wordOfTheDay: fresh.wordOfTheDay ?? null,
    });
    const { phraseOfTheDay: _p, wordOfTheDay: _w, ...homeWithoutDaily } = fresh;
    await AsyncStorage.setItem(
      HOME_DATA_CACHE_KEY,
      JSON.stringify({ ...homeWithoutDaily, _cachedUtcDate: utcTodayKey() }),
    );
    return withDaily;
  }

  async prefetch(retryCount = 0): Promise<void> {
    if (this.prefetchPromise) return this.prefetchPromise;

    this.prefetchPromise = (async () => {
      try {
        let token = await getNestAuthToken();
        for (let i = 0; i < 4 && !token; i += 1) {
          await new Promise((r) => setTimeout(r, 350));
          token = await getNestAuthToken();
        }
        if (!token) return;

        const fresh = await getHomeData();
        await this.persistFresh(fresh);
      } catch (e: any) {
        const status = e?.response?.status;
        if ((status === 401 || status === 403) && retryCount < 2) {
          await new Promise((r) => setTimeout(r, 1200));
          await this.prefetch(retryCount + 1);
          return;
        }
        console.warn("[HomeCache] prefetch failed:", status ?? e?.message ?? e);
      } finally {
        this.prefetchPromise = null;
      }
    })();

    return this.prefetchPromise;
  }
}

export default HomeCacheService;
