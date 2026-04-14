import { PLAN_QUOTAS, type Plan } from './planConfig'

export async function syncPlanToBridge(clerkId: string, plan: Plan): Promise<void> {
  const config = PLAN_QUOTAS[plan]
  const payload = {
    clerkId,
    plan,
    pulseCallsPerWeek: config.pulseCallsPerWeek,
    coreTutorSecondsPerWeek: config.weeklyTutorSeconds,
    coreAiCreditsMonthly: config.monthlyAiCredits,
  }

  const bridgeUrl = process.env.BRIDGE_API_URL ?? 'http://localhost:3012'
  const secret = process.env.BRIDGE_INTERNAL_SECRET ?? ''

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${bridgeUrl}/sync/plan`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': secret,
        },
        body: JSON.stringify(payload),
      })
      if (res.ok) return
      console.warn(`[Bridge sync] attempt ${attempt + 1} failed: HTTP ${res.status}`)
    } catch (e) {
      console.warn(`[Bridge sync] attempt ${attempt + 1} network error:`, e)
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 2000))
  }
  console.error(`[Bridge sync] failed for clerkId=${clerkId} plan=${plan} after 3 attempts`)
}
