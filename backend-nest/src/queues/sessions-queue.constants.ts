/** P2P / LiveKit call post-session analysis (transcript merge, AI, pronunciation). */
export const SESSIONS_P2P_QUEUE = 'sessions-p2p';

/** Maya AI tutor deferred session analysis (separate worker pool). */
export const SESSIONS_MAYA_QUEUE = 'sessions-maya';

export const DEFAULT_P2P_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 50,
};

export const DEFAULT_MAYA_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 50,
};

export function sessionsP2pConcurrency(): number {
  const n = Number(process.env.BULL_SESSIONS_P2P_CONCURRENCY ?? 3);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 3;
}

export function sessionsMayaConcurrency(): number {
  const n = Number(process.env.BULL_SESSIONS_MAYA_CONCURRENCY ?? 2);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 8) : 2;
}
