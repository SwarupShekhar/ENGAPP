import AsyncStorage from "@react-native-async-storage/async-storage";
import { DAILY_CONTENT_CACHE_PREFIX, utcTodayKey } from "./cacheKeys";

export { utcTodayKey } from "./cacheKeys";

export type DailyPhrase = {
  phrase: string;
  definition: string;
  example: string;
  source?: string;
};

export type DailyWord = {
  word: string;
  definition: string;
  example: string;
  partOfSpeech?: string | null;
  source?: string;
};

export interface DailyContent {
  date: string;
  phraseOfTheDay?: DailyPhrase | null;
  wordOfTheDay?: DailyWord | null;
}

type DailyContentListener = (content: DailyContent) => void;
const listeners = new Set<DailyContentListener>();

function storageKey(date: string): string {
  return `${DAILY_CONTENT_CACHE_PREFIX}${date}`;
}

export function onDailyContentUpdated(
  listener: DailyContentListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(content: DailyContent): void {
  listeners.forEach((listener) => listener(content));
}

export async function getDailyContent(
  date: string = utcTodayKey(),
): Promise<DailyContent | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyContent;
    if (parsed.date !== date) return null;
    return parsed;
  } catch (e) {
    console.warn("[DailyContentCache] read failed:", e);
    return null;
  }
}

export async function getDailyContentForToday(): Promise<DailyContent | null> {
  return getDailyContent(utcTodayKey());
}

export async function setDailyContent(content: DailyContent): Promise<void> {
  const date = content.date || utcTodayKey();
  const entry: DailyContent = { ...content, date };
  try {
    await AsyncStorage.setItem(storageKey(date), JSON.stringify(entry));
    emit(entry);
  } catch (e) {
    console.warn("[DailyContentCache] write failed:", e);
  }
}

export async function patchDailyContent(
  patch: Partial<Pick<DailyContent, "phraseOfTheDay" | "wordOfTheDay">>,
  date: string = utcTodayKey(),
): Promise<DailyContent> {
  const existing = (await getDailyContent(date)) ?? { date };
  const merged: DailyContent = {
    ...existing,
    date,
    ...(patch.phraseOfTheDay !== undefined
      ? { phraseOfTheDay: patch.phraseOfTheDay }
      : {}),
    ...(patch.wordOfTheDay !== undefined ? { wordOfTheDay: patch.wordOfTheDay } : {}),
  };
  await setDailyContent(merged);
  return merged;
}

/** Ignore undated home-cache daily fields; dated cache is the source of truth on load. */
export function mergeHomeWithDailyContent(
  home: Record<string, unknown>,
  _cachedUtcDate: string | undefined,
  daily: DailyContent | null,
): Record<string, unknown> {
  const { phraseOfTheDay: _p, wordOfTheDay: _w, _cachedUtcDate: _d, ...rest } =
    home;
  return {
    ...rest,
    phraseOfTheDay: daily?.phraseOfTheDay ?? undefined,
    wordOfTheDay: daily?.wordOfTheDay ?? undefined,
  };
}

/** Foreground push — always overwrite today's phrase/word. */
export async function patchDailyContentFromPush(
  patch: Partial<Pick<DailyContent, "phraseOfTheDay" | "wordOfTheDay">>,
): Promise<void> {
  await patchDailyContent(patch);
}

/** Seed dated cache from /home API without clobbering push-delivered content. */
export async function setDailyContentForToday(
  patch: Partial<Pick<DailyContent, "phraseOfTheDay" | "wordOfTheDay">>,
): Promise<void> {
  const existing = await getDailyContentForToday();
  const toPatch: Partial<Pick<DailyContent, "phraseOfTheDay" | "wordOfTheDay">> =
    {};
  if (patch.phraseOfTheDay && !existing?.phraseOfTheDay) {
    toPatch.phraseOfTheDay = patch.phraseOfTheDay;
  }
  if (patch.wordOfTheDay && !existing?.wordOfTheDay) {
    toPatch.wordOfTheDay = patch.wordOfTheDay;
  }
  if (Object.keys(toPatch).length > 0) {
    await patchDailyContent(toPatch);
  }
}
