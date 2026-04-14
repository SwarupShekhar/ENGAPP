import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { resolveQuota } from '../../../lib/resolveQuota'
import { db } from '../../../lib/db'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolved = await resolveQuota(userId)

  const sub = await db.subscription.findUnique({
    where: { clerkId: userId },
    include: { organization: true },
  })

  return NextResponse.json({
    clerkId: userId,
    plan: resolved.effectivePlan,
    status: sub?.status ?? 'ACTIVE',
    quota: {
      weeklyLimitSeconds: resolved.weeklyLimitSeconds,
      usedSeconds: resolved.usedSeconds,
      rolledOverSeconds: resolved.rolledOverSeconds,
      remainingSeconds: resolved.remainingSeconds,
      weekStartDate: resolved.weekStartDate.toISOString(),
    },
    aiCredits: {
      granted: resolved.aiCreditsGranted,
      used: resolved.aiCreditsUsed,
      remaining: Math.max(0, resolved.aiCreditsGranted - resolved.aiCreditsUsed),
    },
    organization: sub?.organization
      ? {
          id: sub.organization.id,
          name: sub.organization.name,
          poolSeconds: sub.organization.poolSeconds,
          poolUsedSeconds: sub.organization.poolUsedSeconds,
        }
      : null,
  })
}
