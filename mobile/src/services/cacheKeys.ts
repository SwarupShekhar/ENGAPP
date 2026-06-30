/** Bump APP_CACHE_SCHEMA_VERSION when invalidating on-disk caches. */
export const APP_CACHE_SCHEMA_VERSION = 3;
export const APP_CACHE_SCHEMA_KEY = "@app_cache_schema_version";

export const HOME_DATA_CACHE_KEY = "@home_data_cache_v3";
export const EBITES_FEED_CACHE_KEY = "@ebites_feed_cache_v3";

export const LEGACY_CACHE_KEYS = [
  "@home_data_cache",
  "@home_data_cache_v2",
  "@ebites_feed_cache",
  "@ebites_feed_cache_v2",
];

/** Per-user onboarding state (profile + assessment), TTL-managed in onboardingCache.ts */
export const ONBOARDING_CACHE_PREFIX = "engr:onboarding:";
/** Set when MainTabs is reached; read on next launch to skip splash */
export const WARM_START_KEY = "engr:warm_start_v1";
