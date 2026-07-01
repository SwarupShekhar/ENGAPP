import AsyncStorage from "@react-native-async-storage/async-storage";
import { DAILY_CONTENT_CACHE_PREFIX, utcTodayKey } from "./cacheKeys";
import type { DailyListenAudioMap } from "../types/dailyListenVoice";

export { utcTodayKey } from "./cacheKeys";

export type DailyPhrase = {
  phrase: string;
  definition: string;
  example: string;
  source?: string;
  listenAudio?: DailyListenAudioMap;
};

export type DailyWord = {
  word: string;
  definition: string;
  example: string;
  partOfSpeech?: string | null;
  source?: string;
  listenAudio?: DailyListenAudioMap;
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

function mergeListenAudioMaps(
  cached?: DailyListenAudioMap,
  fresh?: DailyListenAudioMap,
): DailyListenAudioMap | undefined {
  if (!cached && !fresh) return undefined;
  return { ...cached, ...fresh };
}

function hasNewListenAudio(
  existing?: DailyListenAudioMap,
  incoming?: DailyListenAudioMap,
): boolean {
  if (!incoming) return false;
  for (const [voice, url] of Object.entries(incoming)) {
    if (!url) continue;
    const key = voice as keyof DailyListenAudioMap;
    if (!existing?.[key] || existing[key] !== url) {
      return true;
    }
  }
  return false;
}

function mergeListenAudio<T extends { listenAudio?: DailyListenAudioMap }>(
  cached: T | null | undefined,
  fresh: T | null | undefined,
): T | null | undefined {
  if (!cached && !fresh) return undefined;
  if (!cached) return fresh ?? undefined;
  if (!fresh) return cached;
  return {
    ...cached,
    ...fresh,
    listenAudio: mergeListenAudioMaps(cached.listenAudio, fresh.listenAudio),
  };
}

export function mergeDailyPhraseFields(
  cached: DailyPhrase | null | undefined,
  fresh: DailyPhrase | null | undefined,
): DailyPhrase | null | undefined {
  return mergeListenAudio(cached, fresh);
}

export function mergeDailyWordFields(
  cached: DailyWord | null | undefined,
  fresh: DailyWord | null | undefined,
): DailyWord | null | undefined {
  return mergeListenAudio(cached, fresh);
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
      ? {
          phraseOfTheDay: mergeDailyPhraseFields(
            existing.phraseOfTheDay,
            patch.phraseOfTheDay,
          ),
        }
      : {}),
    ...(patch.wordOfTheDay !== undefined
      ? {
          wordOfTheDay: mergeDailyWordFields(
            existing.wordOfTheDay,
            patch.wordOfTheDay,
          ),
        }
      : {}),
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
  const homePhrase = home.phraseOfTheDay as DailyPhrase | undefined;
  const homeWord = home.wordOfTheDay as DailyWord | undefined;
  return {
    ...rest,
    phraseOfTheDay: daily?.phraseOfTheDay ?? homePhrase,
    wordOfTheDay: daily?.wordOfTheDay ?? homeWord,
  };
}

/** Foreground push — always overwrite today's phrase/word text (keeps listenAudio if present). */
export async function patchDailyContentFromPush(
  patch: Partial<Pick<DailyContent, "phraseOfTheDay" | "wordOfTheDay">>,
): Promise<void> {
  await patchDailyContent(patch);
}

function dailyTextChanged(
  existing: DailyPhrase | DailyWord | null | undefined,
  incoming: DailyPhrase | DailyWord,
  textKey: "phrase" | "word",
): boolean {
  const prev = (existing as Record<string, string | undefined>)?.[textKey]?.trim();
  const next = (incoming as Record<string, string | undefined>)?.[textKey]?.trim();
  return Boolean(next && prev !== next);
}

/** Merge /home daily fields into dated cache; API text always wins; refresh listenAudio when sent. */
export async function setDailyContentForToday(
  patch: Partial<Pick<DailyContent, "phraseOfTheDay" | "wordOfTheDay">>,
): Promise<void> {
  const existing = await getDailyContentForToday();
  const toPatch: Partial<Pick<DailyContent, "phraseOfTheDay" | "wordOfTheDay">> =
    {};

  if (patch.phraseOfTheDay) {
    const merged = mergeDailyPhraseFields(
      existing?.phraseOfTheDay,
      patch.phraseOfTheDay,
    );
    const audioArrived = hasNewListenAudio(
      existing?.phraseOfTheDay?.listenAudio,
      patch.phraseOfTheDay.listenAudio,
    );
    const textChanged = dailyTextChanged(
      existing?.phraseOfTheDay,
      patch.phraseOfTheDay,
      "phrase",
    );
    if (!existing?.phraseOfTheDay || audioArrived || textChanged) {
      toPatch.phraseOfTheDay = merged ?? patch.phraseOfTheDay;
    }
  }

  if (patch.wordOfTheDay) {
    const merged = mergeDailyWordFields(existing?.wordOfTheDay, patch.wordOfTheDay);
    const audioArrived = hasNewListenAudio(
      existing?.wordOfTheDay?.listenAudio,
      patch.wordOfTheDay.listenAudio,
    );
    const textChanged = dailyTextChanged(
      existing?.wordOfTheDay,
      patch.wordOfTheDay,
      "word",
    );
    if (!existing?.wordOfTheDay || audioArrived || textChanged) {
      toPatch.wordOfTheDay = merged ?? patch.wordOfTheDay;
    }
  }

  if (Object.keys(toPatch).length > 0) {
    await patchDailyContent(toPatch);
  }
}
