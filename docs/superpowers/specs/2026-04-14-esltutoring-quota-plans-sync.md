# ESL Tutoring — Quota + Plans + Mobile Sync Spec

> **Target codebase:** `/Users/swarupshekhar/ESL_T/esltutoring` (the live `englivo.com` Next.js backend)
> **Companion mobile code:** already shipped in `mobile/src/api/englivo/quota.ts` and related screens.

**Goal:** Add weekly free-time quota, 3 Razorpay subscription plans, and instant TutorConnect call support to the live `englivo.com` backend so the EngR mobile app's Core side works end-to-end for internal beta.

**Non-goal:** Do not touch or break any existing credit/session/booking/admin/fluency endpoints. All changes are additive except the two route updates (which gain new code paths while keeping existing ones intact).

---

## 1. What Already Exists (do not change)

| Thing | Location | Status |
|---|---|---|
| `student_profiles.credits` | Prisma schema | Existing credit system for booked sessions — leave as-is |
| `GET /api/livekit/token?mode=ai` | AI instant call path | Working — do not touch |
| `GET /api/livekit/token` (human, no category) | Booked session path | Working — do not touch |
| `/api/webhooks(.*)` public bypass | `src/middleware.ts:67` | Already public — Razorpay webhook goes here |
| `getBridgeUser()` | `src/lib/bridge.ts` | Already works — add `syncPlanToBridge` to same file |
| Idempotency infrastructure | `src/lib/idempotency.ts` | Use for call-end deduction |
| `apiSuccess` / `ApiErrors` | `src/lib/api-response.ts` | Use in all new routes |
| `prisma` singleton | `src/lib/prisma.ts` | Use in all new routes (not `db`) |

---

## 2. New Prisma Models

**File:** `esltutoring/prisma/schema.prisma` — append these models and enums. Do NOT remove or alter existing models.

```prisma
model UserQuota {
  id                String    @id @default(cuid())
  clerkId           String    @unique
  weekStartDate     DateTime
  freeSecondsUsed   Int       @default(0)
  rolledOverSeconds Int       @default(0)
  aiCreditsGranted  Int       @default(0)
  aiCreditsUsed     Int       @default(0)
  creditMonthStart  DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}

model Subscription {
  id                     String        @id @default(cuid())
  clerkId                String        @unique
  plan                   Plan          @default(FREE)
  razorpayCustomerId     String?
  razorpaySubscriptionId String?
  status                 SubStatus     @default(ACTIVE)
  currentPeriodEnd       DateTime?
  organizationId         String?
  organization           Organization? @relation(fields: [organizationId], references: [id])
  createdAt              DateTime      @default(now())
  updatedAt              DateTime      @updatedAt
}

model Organization {
  id                     String       @id @default(cuid())
  name                   String
  adminClerkId           String
  razorpayCustomerId     String?
  razorpaySubscriptionId String?
  seatLimit              Int          @default(10)
  poolSeconds            Int          @default(0)
  poolUsedSeconds        Int          @default(0)
  poolResetDate          DateTime?
  status                 SubStatus    @default(ACTIVE)
  members                Subscription[]
  createdAt              DateTime     @default(now())
  updatedAt              DateTime     @updatedAt
}

model ProcessedSession {
  id              String   @id @default(cuid())
  sessionId       String   @unique
  clerkId         String
  deductedSeconds Int
  processedAt     DateTime @default(now())
}

enum Plan      { FREE STARTER PRO PREMIUM ENTERPRISE }
enum SubStatus { ACTIVE CANCELLED PAST_DUE PAUSED }
```

Run after adding:
```bash
npx prisma migrate dev --name add_quota_plans
npx prisma generate
```

---

## 3. New Lib Files

### 3.1 `src/lib/planConfig.ts` (new file — port from archive)

```ts
export const PLAN_QUOTAS = {
  FREE:       { weeklyTutorSeconds: 1800  as number | null, monthlyAiCredits: 0,   pulseCallsPerWeek: 3    as number | null, rolloverWeeks: 0 },
  STARTER:    { weeklyTutorSeconds: 7200  as number | null, monthlyAiCredits: 20,  pulseCallsPerWeek: null as number | null, rolloverWeeks: 0 },
  PRO:        { weeklyTutorSeconds: 18000 as number | null, monthlyAiCredits: 50,  pulseCallsPerWeek: null as number | null, rolloverWeeks: 1 },
  PREMIUM:    { weeklyTutorSeconds: null  as number | null, monthlyAiCredits: 120, pulseCallsPerWeek: null as number | null, rolloverWeeks: 2 },
  ENTERPRISE: { weeklyTutorSeconds: null  as number | null, monthlyAiCredits: 0,   pulseCallsPerWeek: null as number | null, rolloverWeeks: 0 },
} as const

export type Plan = 'FREE' | 'STARTER' | 'PRO' | 'PREMIUM' | 'ENTERPRISE'

export function getMondayUTC(date: Date): Date {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export function getEffectivePlan(sub: {
  plan: Plan
  status: string
  currentPeriodEnd: Date | null | undefined
}): Plan {
  if (sub.status === 'CANCELLED' && sub.currentPeriodEnd && new Date() > sub.currentPeriodEnd) {
    return 'FREE'
  }
  return sub.plan
}
```

### 3.2 `src/lib/resolveQuota.ts` (new file — port from archive, adapted for `prisma`)

```ts
import { prisma } from '@/lib/prisma'
import { getMondayUTC, getEffectivePlan, PLAN_QUOTAS, type Plan } from '@/lib/planConfig'

export interface ResolvedQuota {
  effectivePlan: Plan
  remainingSeconds: number | null   // null = unlimited
  usedSeconds: number
  rolledOverSeconds: number
  weekStartDate: Date
  weeklyLimitSeconds: number | null
  aiCreditsGranted: number
  aiCreditsUsed: number
}

export async function resolveQuota(clerkId: string): Promise<ResolvedQuota> {
  const sub = await prisma.subscription.upsert({
    where: { clerkId },
    update: {},
    create: { clerkId, plan: 'FREE', status: 'ACTIVE' },
  })

  const effectivePlan = getEffectivePlan(sub) as Plan
  const config = PLAN_QUOTAS[effectivePlan]

  const quota = await prisma.userQuota.upsert({
    where: { clerkId },
    update: {},
    create: { clerkId, weekStartDate: getMondayUTC(new Date()) },
  })

  const currentMonday = getMondayUTC(new Date())
  if (quota.weekStartDate < currentMonday) {
    const weeklyLimit = config.weeklyTutorSeconds
    const unused = weeklyLimit !== null ? Math.max(0, weeklyLimit - quota.freeSecondsUsed) : 0
    const maxRollover = weeklyLimit !== null ? weeklyLimit * config.rolloverWeeks : 0
    const rollover = Math.min(unused, maxRollover)

    await prisma.userQuota.update({
      where: { clerkId },
      data: { freeSecondsUsed: 0, rolledOverSeconds: rollover, weekStartDate: currentMonday },
    })

    quota.freeSecondsUsed = 0
    quota.rolledOverSeconds = rollover
    quota.weekStartDate = currentMonday
  }

  const weeklyLimit = config.weeklyTutorSeconds
  const remaining =
    weeklyLimit === null
      ? null
      : Math.max(0, weeklyLimit - quota.freeSecondsUsed + quota.rolledOverSeconds)

  return {
    effectivePlan,
    remainingSeconds: remaining,
    usedSeconds: quota.freeSecondsUsed,
    rolledOverSeconds: quota.rolledOverSeconds,
    weekStartDate: quota.weekStartDate,
    weeklyLimitSeconds: weeklyLimit,
    aiCreditsGranted: quota.aiCreditsGranted,
    aiCreditsUsed: quota.aiCreditsUsed,
  }
}
```

### 3.3 `src/lib/razorpay.ts` (new file)

```ts
import Razorpay from 'razorpay'
import type { Plan } from '@/lib/planConfig'

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

export const PLAN_TO_RAZORPAY_ID: Record<string, string> = {
  STARTER: 'core_starter_monthly',
  PRO: 'core_pro_monthly',
  PREMIUM: 'core_premium_monthly',
}

export const RAZORPAY_ID_TO_PLAN: Record<string, Plan> = {
  core_starter_monthly: 'STARTER',
  core_pro_monthly: 'PRO',
  core_premium_monthly: 'PREMIUM',
}

const PLAN_ORDER: Plan[] = ['FREE', 'STARTER', 'PRO', 'PREMIUM', 'ENTERPRISE']

export function isPlanHigherOrEqual(a: Plan, b: Plan): boolean {
  return PLAN_ORDER.indexOf(a) >= PLAN_ORDER.indexOf(b)
}
```

Install Razorpay SDK: `npm install razorpay`

### 3.4 Extend `src/lib/bridge.ts` — add `syncPlanToBridge`

Append to the existing `bridge.ts` file (do not replace it):

```ts
export interface SyncPlanDto {
  clerkId: string
  plan: string
  pulseCallsPerWeek: number | null
  coreTutorSecondsPerWeek: number | null
  coreAiCreditsMonthly: number
}

export async function syncPlanToBridge(clerkId: string, plan: string, config: {
  pulseCallsPerWeek: number | null
  weeklyTutorSeconds: number | null
  monthlyAiCredits: number
}): Promise<void> {
  const payload: SyncPlanDto = {
    clerkId,
    plan,
    pulseCallsPerWeek: config.pulseCallsPerWeek,
    coreTutorSecondsPerWeek: config.weeklyTutorSeconds,
    coreAiCreditsMonthly: config.monthlyAiCredits,
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await bridgeFetch<{ ok: boolean }>('/sync/plan', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      if (res) return
    } catch (e) {
      console.warn(`[Bridge sync/plan] attempt ${attempt + 1} failed:`, e)
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 2000))
  }
  console.error(`[Bridge sync/plan] failed for clerkId=${clerkId} after 3 attempts`)
}
```

Note: `bridgeFetch` is the existing internal helper already in `bridge.ts` — reuse it.

---

## 4. Updated Routes

### 4.1 `GET /api/me` — add quota fields

**File:** `src/app/api/me/route.ts`

The existing route returns `{id, role, is_active, credits, bridgeProfile}`. After the change it returns those same fields PLUS quota data. No existing fields are removed.

Add after the existing `dbUser` fetch (before the `return apiSuccess(...)`):

```ts
// Quota data (new — runs resolveQuota which also lazy-resets the weekly window)
const { resolveQuota } = await import('@/lib/resolveQuota')
const quota = await resolveQuota(clerkUser.id)
```

Update the `return apiSuccess({ data: { ... } })` to include:

```ts
return apiSuccess({
  data: {
    // --- existing fields (unchanged) ---
    id: dbUser.id,
    role: finalRole,
    is_active: dbUser.is_active,
    ...((finalRole === 'LEARNER' || IS_OWNER_ADMIN) && { credits: finalCredits }),
    bridgeProfile: bridgeProfile || { cefrLevel: 'B1', fluencyScore: 50, totalPracticeMinutes: 0, streakDays: 0, lastActiveApp: null },
    // --- new quota/plan fields ---
    clerkId: clerkUser.id,
    plan: quota.effectivePlan,
    status: 'ACTIVE',   // resolveQuota already handles CANCELLED grace period
    quota: {
      weeklyLimitSeconds: quota.weeklyLimitSeconds,
      usedSeconds: quota.usedSeconds,
      rolledOverSeconds: quota.rolledOverSeconds,
      remainingSeconds: quota.remainingSeconds,
      weekStartDate: quota.weekStartDate.toISOString(),
    },
    aiCredits: {
      granted: quota.aiCreditsGranted,
      used: quota.aiCreditsUsed,
      remaining: Math.max(0, quota.aiCreditsGranted - quota.aiCreditsUsed),
    },
  },
})
```

### 4.2 `GET /api/livekit/token` — add instant TutorConnect path

**File:** `src/app/api/livekit/token/route.ts`

**Existing behaviour (unchanged):**
- `?mode=ai` → instant AI room (no session needed)
- `?mode=human` (no `category`) → looks up SCHEDULED/LIVE booked session, returns 403 if none

**New behaviour to add:**
- `?mode=human&category=basics|general|business` → quota-gated instant TutorConnect call

Add this block immediately after the `mode === "ai"` block and before the existing human session lookup:

```ts
// NEW: Instant TutorConnect call (category-based, no booked session required)
const category = searchParams.get('category')
const VALID_CATEGORIES = ['basics', 'general', 'business']

if (mode === 'human' && category && VALID_CATEGORIES.includes(category)) {
  const { resolveQuota } = await import('@/lib/resolveQuota')
  const resolved = await resolveQuota(clerkId)

  const isUnlimited = resolved.remainingSeconds === null
  const hasTime = (resolved.remainingSeconds ?? 0) > 0

  if (!isUnlimited && !hasTime) {
    return NextResponse.json(
      { error: 'QUOTA_EXHAUSTED', remainingSeconds: 0 },
      { status: 402 },
    )
  }

  const roomName = `core-${category}-${user.id}-${Date.now()}`
  const at = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: user.email,
    metadata: JSON.stringify({ category, plan: resolved.effectivePlan }),
  })
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true })
  const token = await at.toJwt()

  return NextResponse.json({
    token,
    roomName,
    serverUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL,
    freeMinutesRemaining: resolved.remainingSeconds !== null
      ? Math.floor(resolved.remainingSeconds / 60)
      : null,
    category,
  })
}
// (existing HUMAN session-based path continues below unchanged)
```

---

## 5. New Routes

### 5.1 `POST /api/sessions/call-end`

**File:** `src/app/api/sessions/call-end/route.ts` (new)

```ts
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveQuota } from '@/lib/resolveQuota'
import { getEffectivePlan, PLAN_QUOTAS } from '@/lib/planConfig'
import { apiSuccess, ApiErrors } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return ApiErrors.unauthorized()

  const { sessionId, durationSeconds } = await req.json()

  if (!sessionId || typeof durationSeconds !== 'number' || durationSeconds < 0) {
    return NextResponse.json({ error: 'sessionId and durationSeconds required' }, { status: 400 })
  }

  // Idempotency guard
  const existing = await prisma.processedSession.findUnique({ where: { sessionId } })
  if (existing) {
    const resolved = await resolveQuota(userId)
    return apiSuccess({ data: { alreadyProcessed: true, remainingSeconds: resolved.remainingSeconds } })
  }

  await prisma.$transaction(async (tx) => {
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
    const quota = await tx.userQuota.findUnique({ where: { clerkId: userId } })
    if (!quota) return

    const weeklyLimit = config.weeklyTutorSeconds
    const newUsed = weeklyLimit !== null
      ? Math.min(quota.freeSecondsUsed + durationSeconds, weeklyLimit)
      : quota.freeSecondsUsed + durationSeconds

    await tx.userQuota.update({
      where: { clerkId: userId },
      data: { freeSecondsUsed: newUsed },
    })
  })

  const resolved = await resolveQuota(userId)

  // Fire-and-forget Bridge sync (call-end is informational)
  import('@/lib/bridge')
    .then(({ syncPlanToBridge }) => {
      const config = PLAN_QUOTAS[resolved.effectivePlan]
      return syncPlanToBridge(userId, resolved.effectivePlan, config)
    })
    .catch(console.error)

  return apiSuccess({ data: { remainingSeconds: resolved.remainingSeconds, usedSeconds: resolved.usedSeconds } })
}
```

### 5.2 `POST /api/payments/create-subscription`

**File:** `src/app/api/payments/create-subscription/route.ts` (new)

```ts
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { razorpay, PLAN_TO_RAZORPAY_ID, isPlanHigherOrEqual } from '@/lib/razorpay'
import { getEffectivePlan, type Plan } from '@/lib/planConfig'
import { apiSuccess, ApiErrors } from '@/lib/api-response'

const UPGRADEABLE_PLANS = ['STARTER', 'PRO', 'PREMIUM'] as const

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return ApiErrors.unauthorized()

  const { plan } = await req.json() as { plan: typeof UPGRADEABLE_PLANS[number] }

  if (!UPGRADEABLE_PLANS.includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan. Choose STARTER, PRO, or PREMIUM.' }, { status: 400 })
  }

  const existing = await prisma.subscription.findUnique({ where: { clerkId: userId } })
  if (existing?.status === 'ACTIVE') {
    const currentEffective = getEffectivePlan(existing) as Plan
    if (currentEffective === (plan as Plan)) {
      return NextResponse.json({ error: 'ALREADY_SUBSCRIBED', currentPlan: currentEffective }, { status: 409 })
    }
    if (isPlanHigherOrEqual(currentEffective, plan as Plan)) {
      return NextResponse.json({ error: 'DOWNGRADE_NOT_SUPPORTED', message: 'Contact support to downgrade.' }, { status: 400 })
    }
  }

  let razorpayCustomerId = existing?.razorpayCustomerId ?? null
  if (!razorpayCustomerId) {
    const customer = await razorpay.customers.create({ notes: { clerkId: userId } } as any)
    razorpayCustomerId = customer.id
    await prisma.subscription.upsert({
      where: { clerkId: userId },
      update: { razorpayCustomerId },
      create: { clerkId: userId, plan: 'FREE', status: 'ACTIVE', razorpayCustomerId },
    })
  }

  const subscription = await (razorpay.subscriptions as any).create({
    plan_id: PLAN_TO_RAZORPAY_ID[plan],
    customer_notify: 1,
    quantity: 1,
    total_count: 120,
    notes: { clerkId: userId },
  })

  return apiSuccess({ data: { subscriptionId: subscription.id, shortUrl: subscription.short_url } })
}
```

### 5.3 `POST /api/webhooks/razorpay`

**File:** `src/app/api/webhooks/razorpay/route.ts` (new)

Placed under `/api/webhooks/` so it's already covered by the middleware's public bypass (`/api/webhooks(.*)`).

```ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { RAZORPAY_ID_TO_PLAN } from '@/lib/razorpay'
import { syncPlanToBridge } from '@/lib/bridge'
import { PLAN_QUOTAS, type Plan } from '@/lib/planConfig'

function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET!
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-razorpay-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const event = JSON.parse(rawBody) as { event: string; payload: { subscription?: { entity: any } } }
  const entity = event.payload.subscription?.entity
  if (!entity) return NextResponse.json({ ok: true })

  const clerkId: string = entity.notes?.clerkId
  if (!clerkId) {
    console.warn('[Razorpay Webhook] Missing clerkId in notes:', entity.id)
    return NextResponse.json({ ok: true })
  }

  const unixToDate = (ts: number) => new Date(ts * 1000)

  switch (event.event) {
    case 'subscription.activated': {
      const plan: Plan = RAZORPAY_ID_TO_PLAN[entity.plan_id] ?? 'FREE'
      await prisma.subscription.upsert({
        where: { clerkId },
        update: { plan, status: 'ACTIVE', razorpaySubscriptionId: entity.id, currentPeriodEnd: unixToDate(entity.current_end) },
        create: { clerkId, plan, status: 'ACTIVE', razorpaySubscriptionId: entity.id, currentPeriodEnd: unixToDate(entity.current_end) },
      })
      await syncPlanToBridge(clerkId, plan, PLAN_QUOTAS[plan])
      break
    }
    case 'subscription.charged': {
      const plan: Plan = RAZORPAY_ID_TO_PLAN[entity.plan_id] ?? 'FREE'
      await prisma.subscription.update({ where: { clerkId }, data: { status: 'ACTIVE', currentPeriodEnd: unixToDate(entity.current_end) } })
      const aiCredits = PLAN_QUOTAS[plan].monthlyAiCredits
      if (aiCredits > 0) {
        await prisma.userQuota.upsert({
          where: { clerkId },
          update: { aiCreditsGranted: { increment: aiCredits }, creditMonthStart: new Date() },
          create: { clerkId, weekStartDate: new Date(), aiCreditsGranted: aiCredits, creditMonthStart: new Date() },
        })
      }
      await syncPlanToBridge(clerkId, plan, PLAN_QUOTAS[plan])
      break
    }
    case 'subscription.cancelled': {
      await prisma.subscription.update({ where: { clerkId }, data: { status: 'CANCELLED' } })
      await syncPlanToBridge(clerkId, 'FREE', PLAN_QUOTAS['FREE'])
      break
    }
    case 'subscription.halted': {
      await prisma.subscription.update({ where: { clerkId }, data: { status: 'PAST_DUE' } })
      syncPlanToBridge(clerkId, 'FREE', PLAN_QUOTAS['FREE']).catch(console.error)
      break
    }
  }

  return NextResponse.json({ ok: true })
}
```

---

## 6. Environment Variables to Add

Add to `esltutoring/.env` / production env:

```
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx
```

Bridge env vars already exist (`INTERNAL_BRIDGE_SECRET` / `INTERNAL_SECRET`) — no change needed.

---

## 7. Razorpay Dashboard Setup

Create 3 plans in the Razorpay dashboard before going live:

| Plan ID | Amount | Interval |
|---|---|---|
| `core_starter_monthly` | ₹39900 paise | monthly |
| `core_pro_monthly` | ₹59900 paise | monthly |
| `core_premium_monthly` | ₹89900 paise | monthly |

Configure webhook URL: `https://englivo.com/api/webhooks/razorpay`
Events to subscribe: `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `subscription.halted`

---

## 8. Mobile ↔ Backend Contract (what mobile expects)

| Mobile calls | Backend serves |
|---|---|
| `GET /api/me` | `{clerkId, plan, status, quota:{weeklyLimitSeconds, usedSeconds, remainingSeconds, weekStartDate}, aiCredits:{granted, used, remaining}, ...existing fields}` |
| `GET /api/livekit/token?category=basics&mode=human` | `{token, roomName, serverUrl, freeMinutesRemaining, category}` or `{error:'QUOTA_EXHAUSTED'}` HTTP 402 |
| `POST /api/sessions/call-end` `{sessionId, durationSeconds}` | `{remainingSeconds, usedSeconds}` |
| `POST /api/payments/create-subscription` `{plan:'STARTER'}` | `{subscriptionId, shortUrl}` |

---

## 9. What's NOT in scope

- Bridge `PATCH /sync/plan` endpoint (already specced separately — T9 in main plan)
- Changes to booking/credit/admin/fluency/session endpoints
- Yearly billing (monthly only at launch)
- Enterprise admin portal (manual)
- Automated tutor matching by category (Phase 2)

---

## 10. Implementation Order

1. Schema migration → `prisma migrate dev`
2. `planConfig.ts` → `resolveQuota.ts` (pure logic, no routes)
3. Extend `bridge.ts` with `syncPlanToBridge`
4. `razorpay.ts` + `npm install razorpay`
5. Update `GET /api/me` (additive)
6. Update `GET /api/livekit/token` (additive new path)
7. `POST /api/sessions/call-end`
8. `POST /api/payments/create-subscription`
9. `POST /api/webhooks/razorpay`
10. Test each with a real Clerk session + Razorpay test keys
