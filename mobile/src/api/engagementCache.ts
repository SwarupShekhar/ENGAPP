const CACHE_TTL_MS = 60_000;

type EngagementSnapshot = {
  likedByMe: boolean;
  totalLikes: number;
  commentCount: number;
  expiresAt: number;
};

const cache = new Map<number, EngagementSnapshot>();

export function getCachedEngagement(strapiReelId: number) {
  const entry = cache.get(strapiReelId);
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) cache.delete(strapiReelId);
    return null;
  }
  return {
    likedByMe: entry.likedByMe,
    totalLikes: entry.totalLikes,
    commentCount: entry.commentCount ?? 0,
  };
}

export function setCachedEngagement(
  strapiReelId: number,
  likedByMe: boolean,
  totalLikes: number,
  commentCount = 0,
) {
  cache.set(strapiReelId, {
    likedByMe,
    totalLikes,
    commentCount,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function setCachedCommentCount(strapiReelId: number, commentCount: number) {
  const entry = cache.get(strapiReelId);
  if (!entry) return;
  cache.set(strapiReelId, {
    ...entry,
    commentCount: Math.max(0, commentCount),
    expiresAt: entry.expiresAt,
  });
}

export function patchCachedLike(strapiReelId: number, liked: boolean) {
  const entry = cache.get(strapiReelId);
  if (!entry) return;
  const delta = liked ? 1 : -1;
  cache.set(strapiReelId, {
    likedByMe: liked,
    totalLikes: Math.max(0, entry.totalLikes + delta),
    commentCount: entry.commentCount,
    expiresAt: entry.expiresAt,
  });
}
