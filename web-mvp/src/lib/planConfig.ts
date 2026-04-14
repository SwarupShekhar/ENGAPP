export const PLAN_QUOTAS = {
  FREE:       { weeklyTutorSeconds: 1800  as number | null, monthlyAiCredits: 0,   pulseCallsPerWeek: 3    as number | null, rolloverWeeks: 0 },
  STARTER:    { weeklyTutorSeconds: 7200  as number | null, monthlyAiCredits: 20,  pulseCallsPerWeek: null as number | null, rolloverWeeks: 0 },
  PRO:        { weeklyTutorSeconds: 18000 as number | null, monthlyAiCredits: 50,  pulseCallsPerWeek: null as number | null, rolloverWeeks: 1 },
  PREMIUM:    { weeklyTutorSeconds: null  as number | null, monthlyAiCredits: 120, pulseCallsPerWeek: null as number | null, rolloverWeeks: 2 },
  ENTERPRISE: { weeklyTutorSeconds: null  as number | null, monthlyAiCredits: 0,   pulseCallsPerWeek: null as number | null, rolloverWeeks: 0 },
} as const

export type Plan = 'FREE' | 'STARTER' | 'PRO' | 'PREMIUM' | 'ENTERPRISE'

/** Returns the Monday at 00:00 UTC for the week containing `date`. */
export function getMondayUTC(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay() // 0=Sun, 1=Mon ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/**
 * Returns the plan the user should be treated as having right now.
 * A CANCELLED subscription keeps its plan until currentPeriodEnd passes.
 */
export function getEffectivePlan(sub: {
  plan: Plan
  status: string
  currentPeriodEnd: Date | null | undefined
}): Plan {
  if (
    sub.status === 'CANCELLED' &&
    sub.currentPeriodEnd &&
    new Date() > sub.currentPeriodEnd
  ) {
    return 'FREE'
  }
  return sub.plan
}
