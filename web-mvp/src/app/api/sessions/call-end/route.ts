import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../lib/db'
import { resolveQuota } from '../../../../lib/resolveQuota'
import { getEffectivePlan, PLAN_QUOTAS } from '../../../../lib/planConfig'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { sessionId, durationSeconds } = body as { sessionId: string; durationSeconds: number }

  if (!sessionId || typeof durationSeconds !== 'number' || durationSeconds < 0) {
    return NextResponse.json(
      { error: 'sessionId (string) and durationSeconds (number >= 0) required' },
      { status: 400 },
    )
  }

  // Idempotency — skip if already processed
  const existing = await db.processedSession.findUnique({ where: { sessionId } })
  if (existing) {
    const resolved = await resolveQuota(userId)
    return NextResponse.json({ alreadyProcessed: true, quota: buildQuotaResponse(resolved) })
  }

  await db.$transaction(async (tx) => {
    await tx.processedSession.create({
      data: { sessionId, clerkId: userId, deductedSeconds: durationSeconds },
    })

    const sub = await tx.subscription.findUnique({ where: { clerkId: userId } })
    if (!sub) return

    const effectivePlan = getEffectivePlan(sub)

    if (effectivePlan === 'ENTERPRISE') {
      const org = await tx.organization.findFirst({
        where: { members: { some: { clerkId: userId } } },
      })
      if (org) {
        await tx.organization.update({
          where: { id: org.id },
          data: { poolUsedSeconds: { increment: durationSeconds } },
        })
      }
      return
    }

    const config = PLAN_QUOTAS[effectivePlan]
    const weeklyLimit = config.weeklyTutorSeconds
    const quota = await tx.userQuota.findUnique({ where: { clerkId: userId } })
    if (!quota) return

    const newUsed =
      weeklyLimit !== null
        ? Math.min(quota.freeSecondsUsed + durationSeconds, weeklyLimit)
        : quota.freeSecondsUsed + durationSeconds

    await tx.userQuota.update({
      where: { clerkId: userId },
      data: { freeSecondsUsed: newUsed },
    })
  })

  const resolved = await resolveQuota(userId)

  // Fire-and-forget Bridge sync (informational only for call-end)
  import('../../../lib/bridgeSync')
    .then(({ syncPlanToBridge }) => syncPlanToBridge(userId, resolved.effectivePlan))
    .catch(console.error)

  return NextResponse.json({ quota: buildQuotaResponse(resolved) })
}

function buildQuotaResponse(resolved: Awaited<ReturnType<typeof resolveQuota>>) {
  return {
    weeklyLimitSeconds: resolved.weeklyLimitSeconds,
    usedSeconds: resolved.usedSeconds,
    remainingSeconds: resolved.remainingSeconds,
    weekStartDate: resolved.weekStartDate.toISOString(),
  }
}
