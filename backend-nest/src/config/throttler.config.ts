import { registerAs } from '@nestjs/config';

export default registerAs('throttle', () => ({
  /** Set THROTTLE_ENABLED=false to disable (e.g. local load-test scripts). */
  enabled: process.env.THROTTLE_ENABLED !== 'false',
  defaultTtlMs: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
  defaultLimit: Number(process.env.THROTTLE_LIMIT ?? 120),
  /** Matchmaking poll endpoint — mobile polls every ~3s while searching. */
  matchmakingLimit: Number(process.env.THROTTLE_MATCHMAKING_LIMIT ?? 30),
}));
