import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ONBOARDING_CACHE_PREFIX,
  WARM_START_KEY,
} from "./cacheKeys";

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface OnboardingCacheEntry {
  profileCompleted: boolean;
  assessmentCompleted: boolean;
  updatedAt: number;
}

function onboardingKey(userId: string): string {
  return `${ONBOARDING_CACHE_PREFIX}${userId}`;
}

export function isOnboardingCacheComplete(
  entry: OnboardingCacheEntry | null,
): boolean {
  return !!(entry?.profileCompleted && entry?.assessmentCompleted);
}

export async function getOnboardingCache(
  userId: string,
): Promise<OnboardingCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(onboardingKey(userId));
    if (!raw) return null;

    const entry = JSON.parse(raw) as OnboardingCacheEntry;
    if (
      !entry.updatedAt ||
      Date.now() - entry.updatedAt > TTL_MS ||
      typeof entry.profileCompleted !== "boolean" ||
      typeof entry.assessmentCompleted !== "boolean"
    ) {
      await AsyncStorage.removeItem(onboardingKey(userId));
      return null;
    }

    return entry;
  } catch (e) {
    console.warn("[OnboardingCache] read failed:", e);
    return null;
  }
}

export async function setOnboardingCache(
  userId: string,
  data: Pick<OnboardingCacheEntry, "profileCompleted" | "assessmentCompleted">,
): Promise<void> {
  try {
    const entry: OnboardingCacheEntry = {
      ...data,
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(onboardingKey(userId), JSON.stringify(entry));
  } catch (e) {
    console.warn("[OnboardingCache] write failed:", e);
  }
}

export async function invalidateOnboardingCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(onboardingKey(userId));
  } catch (e) {
    console.warn("[OnboardingCache] invalidate failed:", e);
  }
}

export async function clearOnboardingCacheForUser(userId: string): Promise<void> {
  await invalidateOnboardingCache(userId);
}

async function clearAllOnboardingCaches(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const onboardingKeys = keys.filter((k) =>
      k.startsWith(ONBOARDING_CACHE_PREFIX),
    );
    if (onboardingKeys.length > 0) {
      await AsyncStorage.multiRemove(onboardingKeys);
    }
  } catch (e) {
    console.warn("[OnboardingCache] clear all failed:", e);
  }
}

export async function getWarmStartFlag(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(WARM_START_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setWarmStartFlag(): Promise<void> {
  try {
    await AsyncStorage.setItem(WARM_START_KEY, "1");
  } catch (e) {
    console.warn("[OnboardingCache] warm start set failed:", e);
  }
}

export async function clearWarmStartFlag(): Promise<void> {
  try {
    await AsyncStorage.removeItem(WARM_START_KEY);
  } catch (e) {
    console.warn("[OnboardingCache] warm start clear failed:", e);
  }
}

/** Clears onboarding cache for the user and warm-start splash skip flag. */
export async function clearAllOnboardingState(userId?: string): Promise<void> {
  await Promise.all([
    userId ? clearOnboardingCacheForUser(userId) : clearAllOnboardingCaches(),
    clearWarmStartFlag(),
  ]);
}
