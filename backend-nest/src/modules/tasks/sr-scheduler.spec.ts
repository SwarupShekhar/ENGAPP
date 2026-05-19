import { applySrTransition, SrInput, INTERVALS_DAYS } from './sr-scheduler';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-05-19T00:00:00.000Z');

function base(over: Partial<SrInput> = {}): SrInput {
  return {
    srState: 'LEARNING',
    srStep: 0,
    correctStreak: 0,
    lastAttemptAt: null,
    ...over,
  };
}

describe('applySrTransition', () => {
  it('first pass: streak 1, advances step, schedules next interval', () => {
    const r = applySrTransition(base(), true, now);
    expect(r.correctStreak).toBe(1);
    expect(r.srState).toBe('LEARNING');
    expect(r.srStep).toBe(1);
    expect(r.dueAt.getTime()).toBe(now.getTime() + INTERVALS_DAYS[1] * DAY);
  });

  it('second spaced pass graduates', () => {
    const prev = base({ srStep: 1, correctStreak: 1, lastAttemptAt: new Date(now.getTime() - 4 * DAY) });
    const r = applySrTransition(prev, true, now);
    expect(r.correctStreak).toBe(2);
    expect(r.srState).toBe('GRADUATED');
  });

  it('correct but too soon: no credit, reschedules same step', () => {
    const prev = base({ srStep: 1, correctStreak: 1, lastAttemptAt: new Date(now.getTime() - 1 * DAY) });
    const r = applySrTransition(prev, true, now);
    expect(r.correctStreak).toBe(1);
    expect(r.srState).toBe('LEARNING');
    expect(r.dueAt.getTime()).toBe(now.getTime() + INTERVALS_DAYS[1] * DAY);
  });

  it('fail resets streak and ladder to day 1', () => {
    const prev = base({ srStep: 2, correctStreak: 1, lastAttemptAt: new Date(now.getTime() - 6 * DAY) });
    const r = applySrTransition(prev, false, now);
    expect(r.correctStreak).toBe(0);
    expect(r.srStep).toBe(0);
    expect(r.srState).toBe('LEARNING');
    expect(r.dueAt.getTime()).toBe(now.getTime() + INTERVALS_DAYS[0] * DAY);
    expect(r.lastResult).toBe('FAIL');
  });

  it('step caps at last interval', () => {
    const prev = base({ srStep: 3, correctStreak: 1, lastAttemptAt: new Date(now.getTime() - 8 * DAY) });
    const r = applySrTransition(prev, true, now);
    expect(r.srState).toBe('GRADUATED');
  });
});
