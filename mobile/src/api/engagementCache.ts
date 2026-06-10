const CACHE_TTL_MS = 60_000;

type EngagementSnapshot = {
  likedByMe: boolean;
  totalLikes: number;
  expiresAt: number;
};

const cache = new Map<number, EngagementSnapshot>();

export function getCachedEngagement(strapiReelId: number) {
  const entry = cache.get(strapiReelId);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) cache.delete(strapiReelId);
    return null;
  }
  return { likedByMe: entry.likedByMe, totalLikes: entry.totalLikes };
}

export function setCachedEngagement(
  strapiReelId: number,
  likedByMe: boolean,
  totalLikes: number,
) {
  cache.set(strapiReelId, {
    likedByMe,
    totalLikes,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function patchCachedLike(strapiReelId: number, liked: boolean) {
  const entry = cache.get(strapiReelId);
  if (!entry) return;
  const delta = liked ? 1 : -1;
  cache.set(strapiReelId, {
    likedByMe: liked,
    totalLikes: Math.max(0, entry.totalLikes + delta),
    expiresAt: entry.expiresAt,
  });
}
