import {
  PLAN_QUOTAS,
  getMondayUTC,
  getEffectivePlan,
} from '../lib/planConfig'

describe('getMondayUTC', () => {
  it('returns Monday 00:00 UTC when given a Wednesday', () => {
    const wed = new Date('2026-04-15T14:00:00Z')
    const monday = getMondayUTC(wed)
    expect(monday.toISOString()).toBe('2026-04-13T00:00:00.000Z')
  })

  it('returns same day when given a Monday', () => {
    const mon = new Date('2026-04-13T09:00:00Z')
    expect(getMondayUTC(mon).toISOString()).toBe('2026-04-13T00:00:00.000Z')
  })

  it('returns the previous Monday when given a Sunday', () => {
    const sun = new Date('2026-04-19T23:59:00Z')
    expect(getMondayUTC(sun).toISOString()).toBe('2026-04-13T00:00:00.000Z')
  })
})

describe('getEffectivePlan', () => {
  it('returns FREE when CANCELLED and period has ended', () => {
    const sub = { plan: 'PRO' as const, status: 'CANCELLED' as const, currentPeriodEnd: new Date('2020-01-01') }
    expect(getEffectivePlan(sub)).toBe('FREE')
  })

  it('returns the plan when CANCELLED but period has not ended', () => {
    const sub = { plan: 'PRO' as const, status: 'CANCELLED' as const, currentPeriodEnd: new Date('2099-01-01') }
    expect(getEffectivePlan(sub)).toBe('PRO')
  })

  it('returns the plan when ACTIVE', () => {
    const sub = { plan: 'PREMIUM' as const, status: 'ACTIVE' as const, currentPeriodEnd: new Date('2099-01-01') }
    expect(getEffectivePlan(sub)).toBe('PREMIUM')
  })
})

describe('PLAN_QUOTAS', () => {
  it('PREMIUM has null weeklyTutorSeconds (unlimited)', () => {
    expect(PLAN_QUOTAS.PREMIUM.weeklyTutorSeconds).toBeNull()
  })

  it('FREE has 1800 weeklyTutorSeconds (30 min)', () => {
    expect(PLAN_QUOTAS.FREE.weeklyTutorSeconds).toBe(1800)
  })

  it('PRO has rolloverWeeks 1', () => {
    expect(PLAN_QUOTAS.PRO.rolloverWeeks).toBe(1)
  })
})
