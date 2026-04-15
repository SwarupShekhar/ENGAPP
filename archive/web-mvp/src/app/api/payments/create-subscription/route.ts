import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../lib/db'
import { razorpay, PLAN_TO_RAZORPAY_ID, isPlanHigherOrEqual } from '../../../../lib/razorpay'
import { getEffectivePlan, type Plan } from '../../../../lib/planConfig'

const UPGRADEABLE_PLANS = ['STARTER', 'PRO', 'PREMIUM'] as const
type UpgradeablePlan = typeof UPGRADEABLE_PLANS[number]

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan } = (await req.json()) as { plan: UpgradeablePlan }

  if (!UPGRADEABLE_PLANS.includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan. Choose STARTER, PRO, or PREMIUM.' }, { status: 400 })
  }

  // Duplicate subscription guard
  const existing = await db.subscription.findUnique({ where: { clerkId: userId } })
  if (existing && existing.status === 'ACTIVE') {
    const currentEffective = getEffectivePlan(existing) as Plan
    // Same plan → already subscribed
    if (currentEffective === (plan as Plan)) {
      return NextResponse.json(
        { error: 'ALREADY_SUBSCRIBED', currentPlan: currentEffective },
        { status: 409 },
      )
    }
    // Requesting a lower tier → downgrade not supported in Phase 1
    if (isPlanHigherOrEqual(currentEffective, plan as Plan)) {
      return NextResponse.json(
        { error: 'DOWNGRADE_NOT_SUPPORTED', message: 'Contact support to downgrade.' },
        { status: 400 },
      )
    }
    // currentEffective < plan → upgrade, fall through to create subscription
  }

  let razorpayCustomerId = existing?.razorpayCustomerId ?? null
  if (!razorpayCustomerId) {
    const customer = await razorpay.customers.create({ notes: { clerkId: userId } } as any)
    razorpayCustomerId = customer.id
    await db.subscription.upsert({
      where: { clerkId: userId },
      update: { razorpayCustomerId },
      create: { clerkId: userId, plan: 'FREE', status: 'ACTIVE', razorpayCustomerId },
    })
  }

  const planId = PLAN_TO_RAZORPAY_ID[plan]
  const subscription = await (razorpay.subscriptions as any).create({
    plan_id: planId,
    customer_notify: 1,
    quantity: 1,
    total_count: 120,
    notes: { clerkId: userId },
  })

  return NextResponse.json({
    subscriptionId: subscription.id,
    shortUrl: subscription.short_url,
  })
}
