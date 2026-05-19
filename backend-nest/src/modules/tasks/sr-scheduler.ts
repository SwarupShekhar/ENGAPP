export const INTERVALS_DAYS = [1, 3, 5, 7] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SrInput {
  srState: 'LEARNING' | 'GRADUATED';
  srStep: number;
  correctStreak: number;
  lastAttemptAt: Date | null;
}

export interface SrResult {
  srState: 'LEARNING' | 'GRADUATED';
  srStep: number;
  correctStreak: number;
  dueAt: Date;
  lastAttemptAt: Date;
  lastResult: 'PASS' | 'FAIL';
  graduated: boolean;
}

export function applySrTransition(input: SrInput, pass: boolean, now: Date): SrResult {
  const maxStep = INTERVALS_DAYS.length - 1;
  let { srStep, correctStreak } = input;
  let srState: 'LEARNING' | 'GRADUATED' = 'LEARNING';
  let graduated = false;

  if (pass) {
    const spacedEnough =
      input.lastAttemptAt == null ||
      now.getTime() - input.lastAttemptAt.getTime() >= INTERVALS_DAYS[srStep] * DAY_MS;
    if (spacedEnough) {
      correctStreak += 1;
      if (correctStreak >= 2) {
        srState = 'GRADUATED';
        graduated = true;
      } else {
        srStep = Math.min(srStep + 1, maxStep);
      }
    }
  } else {
    correctStreak = 0;
    srStep = 0;
  }

  const dueAt = new Date(now.getTime() + INTERVALS_DAYS[srStep] * DAY_MS);
  return {
    srState,
    srStep,
    correctStreak,
    dueAt,
    lastAttemptAt: now,
    lastResult: pass ? 'PASS' : 'FAIL',
    graduated,
  };
}
