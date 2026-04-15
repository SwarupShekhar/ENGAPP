# Core Free Time + Plans + Tutor Connect — Implementation Plan

> **Deprecation note (2026-04-14):** `archive/web-mvp` is archived and not part of active runtime/deployment. Keep this plan only as historical implementation context.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add weekly free-time quota, 3 individual paid plans via Razorpay, a TutorConnect category-preference screen, and paywall on Core; sync plan status to Pulse via Bridge API.

**Architecture:** Prisma is added to `archive/web-mvp` (the Core Next.js backend at englivo.com). A shared `resolveQuota()` helper handles lazy weekly reset and is called by every quota-gated endpoint. Razorpay subscriptions drive plan upgrades; webhooks update the DB and retry-sync to Bridge. Mobile adds `TutorConnectPreferenceScreen` before every human-tutor call and an `UpgradeSheet` paywall.

**Tech Stack:** Next.js 16 (App Router), Prisma + PostgreSQL, Razorpay Node SDK, livekit-server-sdk, React Native + react-native-razorpay, Clerk v6.

---

## File Map

**Created:**
- `archive/web-mvp/prisma/schema.prisma` — all 4 models
- `archive/web-mvp/src/lib/db.ts` — Prisma singleton
- `archive/web-mvp/src/lib/planConfig.ts` — PLAN_QUOTAS constant + helpers
- `archive/web-mvp/src/lib/resolveQuota.ts` — lazy reset + quota calc (shared)
- `archive/web-mvp/src/lib/razorpay.ts` — Razorpay client + plan ID maps
- `archive/web-mvp/src/lib/bridgeSync.ts` — syncPlanToBridge with 3× retry
- `archive/web-mvp/src/app/api/me/route.ts`
- `archive/web-mvp/src/app/api/livekit/token/route.ts`
- `archive/web-mvp/src/app/api/sessions/call-end/route.ts`
- `archive/web-mvp/src/app/api/payments/create-subscription/route.ts`
- `archive/web-mvp/src/app/api/payments/webhook/route.ts`
- `mobile/src/api/englivo/quota.ts`
- `mobile/src/features/englivo/screens/TutorConnectPreferenceScreen.tsx`
- `mobile/src/features/englivo/components/UpgradeSheet.tsx`

**Modified:**
- `archive/web-mvp/package.json` — add prisma, razorpay, livekit-server-sdk
- `archive/web-mvp/src/middleware.ts` — allow webhook route through without auth
- `mobile/src/navigation/RootNavigator.tsx` — add TutorConnectPreference screen
- `mobile/src/features/englivo/screens/EnglivoHomeScreenV2.tsx` — quota check + lock + route change
- `mobile/src/features/englivo/screens/EnglivoLiveCallScreen.tsx` — call-end deduction on unmount

**Bridge backend** (separate service at bridge.engr.app):
- Add `PATCH /sync/plan` endpoint — noted in Task 9, implement in that service's repo

---

## Task 1: Add Prisma to archive/web-mvp and create schema

**Files:**
- Create: `archive/web-mvp/prisma/schema.prisma`
- Modify: `archive/web-mvp/package.json`
- Create: `archive/web-mvp/src/lib/db.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd archive/web-mvp
npm install prisma @prisma/client
npm install --save-dev prisma
```

- [ ] **Step 2: Initialise Prisma**

```bash
cd archive/web-mvp
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and adds `DATABASE_URL` to `.env`.

- [ ] **Step 3: Replace generated schema with the full model**

Write `archive/web-mvp/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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

- [ ] **Step 4: Run migration**

```bash
cd archive/web-mvp
npx prisma migrate dev --name init_quota_plans
```

Expected: migration file created, tables created in DB.

- [ ] **Step 5: Create Prisma singleton**

Write `archive/web-mvp/src/lib/db.ts`:

```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['error'] : [] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

- [ ] **Step 6: Commit**

```bash
cd archive/web-mvp
git add prisma/schema.prisma src/lib/db.ts package.json package-lock.json
git commit -m "feat: add Prisma schema — UserQuota, Subscription, Organization, ProcessedSession"
```

---

## Task 2: Plan config and pure utility functions

**Files:**
- Create: `archive/web-mvp/src/lib/planConfig.ts`

- [ ] **Step 1: Write the failing test**

Create `archive/web-mvp/src/__tests__/planConfig.test.ts`:

```ts
import {
  PLAN_QUOTAS,
  getMondayUTC,
  getEffectivePlan,
} from '../lib/planConfig'

describe('getMondayUTC', () => {
  it('returns Monday 00:00 UTC when given a Wednesday', () => {
    const wed = new Date('2026-04-15T14:00:00Z') // Wednesday
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
    const sub = {
      plan: 'PRO' as const,
      status: 'CANCELLED' as const,
      currentPeriodEnd: new Date('2020-01-01'),
    }
    expect(getEffectivePlan(sub)).toBe('FREE')
  })

  it('returns the plan when CANCELLED but period has not ended', () => {
    const sub = {
      plan: 'PRO' as const,
      status: 'CANCELLED' as const,
      currentPeriodEnd: new Date('2099-01-01'),
    }
    expect(getEffectivePlan(sub)).toBe('PRO')
  })

  it('returns the plan when ACTIVE', () => {
    const sub = {
      plan: 'PREMIUM' as const,
      status: 'ACTIVE' as const,
      currentPeriodEnd: new Date('2099-01-01'),
    }
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
```

- [ ] **Step 2: Install Jest and run to confirm failure**

```bash
cd archive/web-mvp
npm install --save-dev jest @types/jest ts-jest
npx jest src/__tests__/planConfig.test.ts
```

Expected: FAIL — `Cannot find module '../lib/planConfig'`

- [ ] **Step 3: Create planConfig.ts**

Write `archive/web-mvp/src/lib/planConfig.ts`:

```ts
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
```

- [ ] **Step 4: Add jest config to package.json and run tests**

Add to `archive/web-mvp/package.json`:

```json
"jest": {
  "preset": "ts-jest",
  "testEnvironment": "node"
}
```

```bash
cd archive/web-mvp
npx jest src/__tests__/planConfig.test.ts
```

Expected: PASS — 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd archive/web-mvp
git add src/lib/planConfig.ts src/__tests__/planConfig.test.ts package.json
git commit -m "feat: add planConfig — PLAN_QUOTAS, getMondayUTC, getEffectivePlan"
```

---

## Task 3: resolveQuota helper

**Files:**
- Create: `archive/web-mvp/src/lib/resolveQuota.ts`
- Create: `archive/web-mvp/src/__tests__/resolveQuota.test.ts`

- [ ] **Step 1: Write the failing test**

Write `archive/web-mvp/src/__tests__/resolveQuota.test.ts`:

```ts
import { resolveQuota } from '../lib/resolveQuota'
import { getMondayUTC } from '../lib/planConfig'

// Mock the db module
jest.mock('../lib/db', () => ({
  db: {
    subscription: {
      upsert: jest.fn(),
    },
    userQuota: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
  },
}))

import { db } from '../lib/db'

const mockDb = db as jest.Mocked<typeof db>

beforeEach(() => jest.clearAllMocks())

describe('resolveQuota', () => {
  it('resets freeSecondsUsed when weekStartDate is before current Monday', async () => {
    const oldMonday = new Date('2026-01-05T00:00:00Z') // a past Monday
    ;(mockDb.subscription.upsert as jest.Mock).mockResolvedValue({
      plan: 'FREE',
      status: 'ACTIVE',
      currentPeriodEnd: null,
    })
    ;(mockDb.userQuota.upsert as jest.Mock).mockResolvedValue({
      weekStartDate: oldMonday,
      freeSecondsUsed: 900,
      rolledOverSeconds: 0,
    })
    ;(mockDb.userQuota.update as jest.Mock).mockResolvedValue({})

    const result = await resolveQuota('user_test')

    expect(mockDb.userQuota.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ freeSecondsUsed: 0 }),
      })
    )
    expect(result.remainingSeconds).toBe(1800)
  })

  it('returns null remainingSeconds for PREMIUM (unlimited)', async () => {
    ;(mockDb.subscription.upsert as jest.Mock).mockResolvedValue({
      plan: 'PREMIUM',
      status: 'ACTIVE',
      currentPeriodEnd: null,
    })
    ;(mockDb.userQuota.upsert as jest.Mock).mockResolvedValue({
      weekStartDate: getMondayUTC(new Date()),
      freeSecondsUsed: 0,
      rolledOverSeconds: 0,
    })

    const result = await resolveQuota('user_premium')

    expect(result.remainingSeconds).toBeNull()
    expect(mockDb.userQuota.update).not.toHaveBeenCalled()
  })

  it('does not roll over seconds for PREMIUM even after week reset', async () => {
    const oldMonday = new Date('2026-01-05T00:00:00Z')
    ;(mockDb.subscription.upsert as jest.Mock).mockResolvedValue({
      plan: 'PREMIUM',
      status: 'ACTIVE',
      currentPeriodEnd: null,
    })
    ;(mockDb.userQuota.upsert as jest.Mock).mockResolvedValue({
      weekStartDate: oldMonday,
      freeSecondsUsed: 500,
      rolledOverSeconds: 0,
    })
    ;(mockDb.userQuota.update as jest.Mock).mockResolvedValue({})

    await resolveQuota('user_premium2')

    expect(mockDb.userQuota.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rolledOverSeconds: 0 }),
      })
    )
  })
})
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd archive/web-mvp
npx jest src/__tests__/resolveQuota.test.ts
```

Expected: FAIL — `Cannot find module '../lib/resolveQuota'`

- [ ] **Step 3: Create resolveQuota.ts**

Write `archive/web-mvp/src/lib/resolveQuota.ts`:

```ts
import { db } from './db'
import { getMondayUTC, getEffectivePlan, PLAN_QUOTAS, Plan } from './planConfig'

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
  // 1. Get or create subscription
  const sub = await db.subscription.upsert({
    where: { clerkId },
    update: {},
    create: { clerkId, plan: 'FREE', status: 'ACTIVE' },
  })

  const effectivePlan = getEffectivePlan(sub) as Plan
  const config = PLAN_QUOTAS[effectivePlan]

  // 2. Get or create quota row
  const quota = await db.userQuota.upsert({
    where: { clerkId },
    update: {},
    create: { clerkId, weekStartDate: getMondayUTC(new Date()) },
  })

  // 3. Lazy weekly reset
  const currentMonday = getMondayUTC(new Date())
  if (quota.weekStartDate < currentMonday) {
    const weeklyLimit = config.weeklyTutorSeconds
    // Guard: unlimited plans produce no rollover
    const unused =
      weeklyLimit !== null
        ? Math.max(0, weeklyLimit - quota.freeSecondsUsed)
        : 0
    const maxRollover =
      weeklyLimit !== null ? weeklyLimit * config.rolloverWeeks : 0
    const rollover = Math.min(unused, maxRollover)

    await db.userQuota.update({
      where: { clerkId },
      data: {
        freeSecondsUsed: 0,
        rolledOverSeconds: rollover,
        weekStartDate: currentMonday,
      },
    })

    quota.freeSecondsUsed = 0
    quota.rolledOverSeconds = rollover
    quota.weekStartDate = currentMonday
  }

  // 4. Compute remaining
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

- [ ] **Step 4: Run tests**

```bash
cd archive/web-mvp
npx jest src/__tests__/resolveQuota.test.ts
```

Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd archive/web-mvp
git add src/lib/resolveQuota.ts src/__tests__/resolveQuota.test.ts
git commit -m "feat: add resolveQuota helper — lazy weekly reset, rollover, unlimited guard"
```

---

## Task 4: GET /api/me route

**Files:**
- Create: `archive/web-mvp/src/app/api/me/route.ts`

- [ ] **Step 1: Create the route**

Write `archive/web-mvp/src/app/api/me/route.ts`:

```ts
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
```

- [ ] **Step 2: Manual test**

Start `archive/web-mvp`:
```bash
cd archive/web-mvp && npm run dev
```

In a terminal with a valid Clerk session cookie:
```bash
curl -H "Authorization: Bearer <clerk_token>" http://localhost:3000/api/me
```

Expected: `{"clerkId":"user_xxx","plan":"FREE","quota":{"weeklyLimitSeconds":1800,...}}`

- [ ] **Step 3: Commit**

```bash
cd archive/web-mvp
git add src/app/api/me/route.ts
git commit -m "feat: GET /api/me — user profile + plan + quota"
```

---

## Task 5: GET /api/livekit/token route

**Files:**
- Create: `archive/web-mvp/src/lib/livekit.ts`
- Create: `archive/web-mvp/src/app/api/livekit/token/route.ts`

- [ ] **Step 1: Install livekit-server-sdk**

```bash
cd archive/web-mvp
npm install livekit-server-sdk
```

- [ ] **Step 2: Add env vars to archive/web-mvp/.env**

```
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=wss://ssengst-174tfe9o.livekit.cloud
```

- [ ] **Step 3: Create LiveKit token helper**

Write `archive/web-mvp/src/lib/livekit.ts`:

```ts
import { AccessToken } from 'livekit-server-sdk'

export async function generateLiveKitToken(
  userId: string,
  roomName: string,
  metadata?: string,
): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) throw new Error('LIVEKIT_API_KEY / LIVEKIT_API_SECRET not set')

  const at = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    metadata,
  })
  at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true })
  return at.toJwt()
}

export function makeRoomName(userId: string, category: string): string {
  return `core-${category}-${userId}-${Date.now()}`
}
```

- [ ] **Step 4: Create the route**

Write `archive/web-mvp/src/app/api/livekit/token/route.ts`:

```ts
import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { resolveQuota } from '../../../../lib/resolveQuota'
import { generateLiveKitToken, makeRoomName } from '../../../../lib/livekit'

const VALID_CATEGORIES = ['basics', 'general', 'business'] as const
type Category = typeof VALID_CATEGORIES[number]

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = (searchParams.get('category') ?? 'general') as Category
  const mode = searchParams.get('mode') ?? 'human'

  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  if (mode === 'human') {
    // resolveQuota runs lazy reset — always fresh
    const resolved = await resolveQuota(userId)

    const isUnlimited = resolved.remainingSeconds === null
    const hasTime = (resolved.remainingSeconds ?? 0) > 0

    if (!isUnlimited && !hasTime) {
      return NextResponse.json(
        { error: 'QUOTA_EXHAUSTED', remainingSeconds: 0 },
        { status: 402 },
      )
    }

    const roomName = makeRoomName(userId, category)
    const metadata = JSON.stringify({ category, plan: resolved.effectivePlan })
    const token = await generateLiveKitToken(userId, roomName, metadata)

    return NextResponse.json({
      token,
      roomName,
      serverUrl: process.env.LIVEKIT_URL ?? 'wss://ssengst-174tfe9o.livekit.cloud',
      freeMinutesRemaining:
        resolved.remainingSeconds !== null
          ? Math.floor(resolved.remainingSeconds / 60)
          : null,
      category,
    })
  }

  // mode=ai — no quota gate in Phase 1
  const roomName = makeRoomName(userId, `ai-${category}`)
  const token = await generateLiveKitToken(userId, roomName)
  return NextResponse.json({
    token,
    roomName,
    serverUrl: process.env.LIVEKIT_URL ?? 'wss://ssengst-174tfe9o.livekit.cloud',
    category,
  })
}
```

- [ ] **Step 5: Manual test — free user**

```bash
curl -H "Authorization: Bearer <clerk_token>" \
  "http://localhost:3000/api/livekit/token?category=basics&mode=human"
```

Expected: `{"token":"...","roomName":"core-basics-user_xxx-...","freeMinutesRemaining":30}`

- [ ] **Step 6: Manual test — exhausted quota**

Update UserQuota in DB: set `freeSecondsUsed = 1800`, then:

```bash
curl -H "Authorization: Bearer <clerk_token>" \
  "http://localhost:3000/api/livekit/token?category=basics&mode=human"
```

Expected: HTTP 402 `{"error":"QUOTA_EXHAUSTED","remainingSeconds":0}`

- [ ] **Step 7: Commit**

```bash
cd archive/web-mvp
git add src/lib/livekit.ts src/app/api/livekit/token/route.ts
git commit -m "feat: GET /api/livekit/token — quota gate + LiveKit token generation"
```

---

## Task 6: POST /api/sessions/call-end route

**Files:**
- Create: `archive/web-mvp/src/app/api/sessions/call-end/route.ts`

- [ ] **Step 1: Create the route**

Write `archive/web-mvp/src/app/api/sessions/call-end/route.ts`:

```ts
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
    // Mark processed first (unique constraint guards concurrent requests)
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

  // Fire-and-forget — call-end Bridge sync is informational only
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
```

- [ ] **Step 2: Manual test — deduction**

```bash
curl -X POST -H "Authorization: Bearer <clerk_token>" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test-session-001","durationSeconds":300}' \
  http://localhost:3000/api/sessions/call-end
```

Expected: `{"quota":{"usedSeconds":300,"remainingSeconds":1500,...}}`

- [ ] **Step 3: Manual test — idempotency**

Run the same curl again.
Expected: `{"alreadyProcessed":true,"quota":{...}}` — seconds unchanged.

- [ ] **Step 4: Commit**

```bash
cd archive/web-mvp
git add src/app/api/sessions/call-end/route.ts
git commit -m "feat: POST /api/sessions/call-end — idempotent deduction via ProcessedSession"
```

---

## Task 7: Razorpay client + create-subscription route

**Files:**
- Create: `archive/web-mvp/src/lib/razorpay.ts`
- Create: `archive/web-mvp/src/app/api/payments/create-subscription/route.ts`
- Modify: `archive/web-mvp/src/middleware.ts`

- [ ] **Step 1: Install Razorpay SDK**

```bash
cd archive/web-mvp
npm install razorpay
npm install --save-dev @types/razorpay
```

- [ ] **Step 2: Add env vars**

Add to `archive/web-mvp/.env`:
```
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx
```

- [ ] **Step 3: Create Razorpay singleton + plan ID map**

Write `archive/web-mvp/src/lib/razorpay.ts`:

```ts
import Razorpay from 'razorpay'
import type { Plan } from './planConfig'

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

// These plan IDs must exist in your Razorpay dashboard
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

// Plan tier order — higher index = higher tier
const PLAN_ORDER: Plan[] = ['FREE', 'STARTER', 'PRO', 'PREMIUM', 'ENTERPRISE']

export function isPlanHigherOrEqual(a: Plan, b: Plan): boolean {
  return PLAN_ORDER.indexOf(a) >= PLAN_ORDER.indexOf(b)
}
```

- [ ] **Step 4: Create the route**

Write `archive/web-mvp/src/app/api/payments/create-subscription/route.ts`:

```ts
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
    if (isPlanHigherOrEqual(currentEffective, plan as Plan)) {
      return NextResponse.json(
        { error: 'ALREADY_SUBSCRIBED', currentPlan: currentEffective },
        { status: 409 },
      )
    }
    // Downgrade requested
    if (PLAN_TO_RAZORPAY_ID[currentEffective]) {
      return NextResponse.json(
        { error: 'DOWNGRADE_NOT_SUPPORTED', message: 'Contact support to downgrade.' },
        { status: 400 },
      )
    }
  }

  // Get or create Razorpay customer
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
    total_count: 120, // 10 years max
    notes: { clerkId: userId },
  })

  return NextResponse.json({
    subscriptionId: subscription.id,
    shortUrl: subscription.short_url,
  })
}
```

- [ ] **Step 5: Update middleware to allow webhook through**

Modify `archive/web-mvp/src/middleware.ts`:

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/',
  '/api/payments/webhook', // Razorpay cannot send Clerk auth
])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
```

- [ ] **Step 6: Manual test**

```bash
curl -X POST -H "Authorization: Bearer <clerk_token>" \
  -H "Content-Type: application/json" \
  -d '{"plan":"STARTER"}' \
  http://localhost:3000/api/payments/create-subscription
```

Expected: `{"subscriptionId":"sub_xxx","shortUrl":"https://rzp.io/..."}`

- [ ] **Step 7: Commit**

```bash
cd archive/web-mvp
git add src/lib/razorpay.ts src/app/api/payments/create-subscription/route.ts src/middleware.ts
git commit -m "feat: Razorpay create-subscription + allow webhook route through Clerk middleware"
```

---

## Task 8: Razorpay webhook + Bridge sync helper

**Files:**
- Create: `archive/web-mvp/src/lib/bridgeSync.ts`
- Create: `archive/web-mvp/src/app/api/payments/webhook/route.ts`

- [ ] **Step 1: Add Bridge env vars**

Add to `archive/web-mvp/.env`:
```
BRIDGE_API_URL=http://localhost:3012
BRIDGE_INTERNAL_SECRET=your_bridge_internal_secret
```

- [ ] **Step 2: Create bridgeSync helper**

Write `archive/web-mvp/src/lib/bridgeSync.ts`:

```ts
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
```

- [ ] **Step 3: Create webhook route**

Write `archive/web-mvp/src/app/api/payments/webhook/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '../../../../lib/db'
import { RAZORPAY_ID_TO_PLAN } from '../../../../lib/razorpay'
import { syncPlanToBridge } from '../../../../lib/bridgeSync'
import { PLAN_QUOTAS, type Plan } from '../../../../lib/planConfig'

function verifySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET!
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

function unixToDate(ts: number): Date {
  return new Date(ts * 1000)
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-razorpay-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const event = JSON.parse(rawBody) as {
    event: string
    payload: { subscription?: { entity: any } }
  }

  const entity = event.payload.subscription?.entity
  if (!entity) return NextResponse.json({ ok: true })

  const clerkId: string = entity.notes?.clerkId
  if (!clerkId) {
    console.warn('[Webhook] Missing clerkId in subscription notes:', entity.id)
    return NextResponse.json({ ok: true })
  }

  switch (event.event) {
    case 'subscription.activated': {
      const plan: Plan = RAZORPAY_ID_TO_PLAN[entity.plan_id] ?? 'FREE'
      await db.subscription.upsert({
        where: { clerkId },
        update: {
          plan,
          status: 'ACTIVE',
          razorpaySubscriptionId: entity.id,
          currentPeriodEnd: unixToDate(entity.current_end),
        },
        create: {
          clerkId,
          plan,
          status: 'ACTIVE',
          razorpaySubscriptionId: entity.id,
          currentPeriodEnd: unixToDate(entity.current_end),
        },
      })
      await syncPlanToBridge(clerkId, plan)
      break
    }

    case 'subscription.charged': {
      const plan: Plan = RAZORPAY_ID_TO_PLAN[entity.plan_id] ?? 'FREE'
      const aiCredits = PLAN_QUOTAS[plan].monthlyAiCredits
      await db.subscription.update({
        where: { clerkId },
        data: {
          status: 'ACTIVE',
          currentPeriodEnd: unixToDate(entity.current_end),
        },
      })
      // Grant monthly AI credits
      if (aiCredits > 0) {
        await db.userQuota.upsert({
          where: { clerkId },
          update: {
            aiCreditsGranted: { increment: aiCredits },
            creditMonthStart: new Date(),
          },
          create: {
            clerkId,
            weekStartDate: new Date(),
            aiCreditsGranted: aiCredits,
            creditMonthStart: new Date(),
          },
        })
      }
      await syncPlanToBridge(clerkId, plan)
      break
    }

    case 'subscription.cancelled': {
      // Keep plan + currentPeriodEnd — user retains access until period ends.
      // getEffectivePlan() downgrades to FREE after currentPeriodEnd passes.
      await db.subscription.update({
        where: { clerkId },
        data: { status: 'CANCELLED' },
      })
      // Sync FREE values so Bridge/Pulse see the upcoming downgrade immediately
      await syncPlanToBridge(clerkId, 'FREE')
      break
    }

    case 'subscription.halted': {
      await db.subscription.update({
        where: { clerkId },
        data: { status: 'PAST_DUE' },
      })
      // Fire-and-forget — plan values unchanged, Pulse not affected
      syncPlanToBridge(clerkId, 'FREE').catch(console.error)
      break
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Manual test with Razorpay test webhook**

In Razorpay dashboard → Webhooks → send test event `subscription.activated`.

Expected: DB `Subscription.plan` updates, `[Bridge sync]` log appears.

- [ ] **Step 5: Commit**

```bash
cd archive/web-mvp
git add src/lib/bridgeSync.ts src/app/api/payments/webhook/route.ts
git commit -m "feat: Razorpay webhook handler + Bridge sync with 3x retry"
```

---

## Task 9: Bridge PATCH /sync/plan endpoint

**Note:** The Bridge backend runs at `bridge.engr.app` (port 3012 locally). This is a **separate service** from this repo. Add the following endpoint to that service.

**Files** (in the Bridge backend repo):
- Modify: the route file that handles `PATCH /user/:clerkId` and `PATCH /sync/cefr` — add a sibling route for `/sync/plan`

- [ ] **Step 1: Add /sync/plan route to Bridge backend**

The Bridge backend already has `PATCH /sync/cefr`. Add adjacent to it:

```ts
// PATCH /sync/plan
router.patch('/sync/plan', requireInternalSecret, async (req, res) => {
  const {
    clerkId,
    plan,
    pulseCallsPerWeek,
    coreTutorSecondsPerWeek,
    coreAiCreditsMonthly,
  } = req.body as {
    clerkId: string
    plan: string
    pulseCallsPerWeek: number | null
    coreTutorSecondsPerWeek: number | null
    coreAiCreditsMonthly: number
  }

  if (!clerkId || !plan) {
    return res.status(400).json({ error: 'clerkId and plan required' })
  }

  await db.user.upsert({
    where: { clerkId },
    update: {
      plan,
      pulseCallsPerWeek,
      coreTutorSecondsPerWeek,
      coreAiCreditsMonthly,
      planUpdatedAt: new Date(),
    },
    create: {
      clerkId,
      plan,
      pulseCallsPerWeek,
      coreTutorSecondsPerWeek,
      coreAiCreditsMonthly,
      planUpdatedAt: new Date(),
    },
  })

  return res.json({ ok: true })
})
```

Also update `GET /user/:clerkId` response to include `plan`, `pulseCallsPerWeek`, `coreTutorSecondsPerWeek`, `coreAiCreditsMonthly`.

- [ ] **Step 2: Add plan fields to Bridge user schema**

In Bridge DB schema, add to user model:

```
plan                   String   @default("FREE")
pulseCallsPerWeek      Int?
coreTutorSecondsPerWeek Int?
coreAiCreditsMonthly   Int      @default(0)
planUpdatedAt          DateTime?
```

Run migration in Bridge backend.

- [ ] **Step 3: Manual test**

```bash
curl -X PATCH http://localhost:3012/sync/plan \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: your_secret" \
  -d '{"clerkId":"user_xxx","plan":"STARTER","pulseCallsPerWeek":null,"coreTutorSecondsPerWeek":7200,"coreAiCreditsMonthly":20}'
```

Expected: `{"ok":true}`

Then:
```bash
curl http://localhost:3012/user/user_xxx \
  -H "x-internal-secret: your_secret"
```

Expected: response includes `"plan":"STARTER","pulseCallsPerWeek":null`

- [ ] **Step 4: Commit Bridge changes**

```bash
# In Bridge backend repo
git add .
git commit -m "feat: PATCH /sync/plan — sync Core plan status from Core backend"
```

---

## Task 10: Mobile quota API client

**Files:**
- Create: `mobile/src/api/englivo/quota.ts`

- [ ] **Step 1: Create quota API functions**

Write `mobile/src/api/englivo/quota.ts`:

```ts
import { client } from '../englivoClient'

export interface QuotaStatus {
  weeklyLimitSeconds: number | null
  usedSeconds: number
  rolledOverSeconds: number
  remainingSeconds: number | null  // null = unlimited
  weekStartDate: string
}

export interface AiCredits {
  granted: number
  used: number
  remaining: number
}

export interface MeResponse {
  clerkId: string
  plan: 'FREE' | 'STARTER' | 'PRO' | 'PREMIUM' | 'ENTERPRISE'
  status: 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'PAUSED'
  quota: QuotaStatus
  aiCredits: AiCredits
  organization: { id: string; name: string; poolSeconds: number; poolUsedSeconds: number } | null
}

export interface LiveKitTokenResponse {
  token: string
  roomName: string
  serverUrl: string
  freeMinutesRemaining: number | null
  category: string
  error?: string
}

export interface SubscriptionResponse {
  subscriptionId: string
  shortUrl: string
  error?: string
  currentPlan?: string
}

/** GET /api/me — plan + quota status */
export const getMe = (): Promise<MeResponse> =>
  client.get<MeResponse>('/api/me').then((r) => r.data)

/** GET /api/livekit/token?category=...&mode=human */
export const getLiveKitToken = (
  category: 'basics' | 'general' | 'business',
  mode: 'human' | 'ai' = 'human',
): Promise<LiveKitTokenResponse> =>
  client
    .get<LiveKitTokenResponse>('/api/livekit/token', { params: { category, mode } })
    .then((r) => r.data)
    .catch((err) => {
      // Return structured error so callers can check error field
      if (err.response?.status === 402) {
        return { error: 'QUOTA_EXHAUSTED', remainingSeconds: 0 } as any
      }
      throw err
    })

/** POST /api/sessions/call-end */
export const postCallEnd = (sessionId: string, durationSeconds: number): Promise<void> =>
  client
    .post('/api/sessions/call-end', { sessionId, durationSeconds })
    .then(() => undefined)
    .catch(console.error)  // fire-and-forget; errors are non-fatal

/** POST /api/payments/create-subscription */
export const createSubscription = (
  plan: 'STARTER' | 'PRO' | 'PREMIUM',
): Promise<SubscriptionResponse> =>
  client
    .post<SubscriptionResponse>('/api/payments/create-subscription', { plan })
    .then((r) => r.data)
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/api/englivo/quota.ts
git commit -m "feat: mobile quota API client — getMe, getLiveKitToken, postCallEnd, createSubscription"
```

---

## Task 11: TutorConnectPreferenceScreen

**Files:**
- Create: `mobile/src/features/englivo/screens/TutorConnectPreferenceScreen.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx`

- [ ] **Step 1: Create the screen**

Write `mobile/src/features/englivo/screens/TutorConnectPreferenceScreen.tsx`:

```tsx
import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { getLiveKitToken } from '../../../api/englivo/quota'

const C = {
  void: '#080C14',
  card: '#111827',
  cardBorder: '#1E2D45',
  goldBright: '#F5C842',
  goldMid: '#E8A020',
  ash: '#8B9AB0',
  white: '#F4F6FA',
}

type Category = 'basics' | 'general' | 'business'

const CATEGORIES: {
  key: Category
  label: string
  subtitle: string
  icon: string
  topics: string[]
}[] = [
  {
    key: 'basics',
    label: 'The Basics',
    subtitle: 'Grammar',
    icon: 'school-outline',
    topics: ['Modal verbs', 'Phrasal verbs', 'Idioms', 'Verb tenses'],
  },
  {
    key: 'general',
    label: 'Day-to-Day',
    subtitle: 'General English',
    icon: 'chatbubbles-outline',
    topics: ['Travel', 'Hobbies', 'Entertainment', 'AI'],
  },
  {
    key: 'business',
    label: 'Growth',
    subtitle: 'Business English',
    icon: 'briefcase-outline',
    topics: ['Presentations', 'Meetings', 'Interviews', 'Professional sectors'],
  },
]

export default function TutorConnectPreferenceScreen() {
  const navigation = useNavigation<any>()
  const [loading, setLoading] = useState<Category | null>(null)

  async function handleSelect(category: Category) {
    setLoading(category)
    try {
      const result = await getLiveKitToken(category, 'human')
      if (result.error === 'QUOTA_EXHAUSTED') {
        // Navigate back to home — UpgradeSheet will be shown from there
        navigation.navigate('MainTabs')
        return
      }
      navigation.navigate('EnglivoLiveCall', {
        token: result.token,
        roomName: result.roomName,
        serverUrl: result.serverUrl,
        freeMinutesRemaining: result.freeMinutesRemaining,
        category,
      })
    } catch (err) {
      Alert.alert('Connection Error', 'Could not connect. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={22} color={C.white} />
      </TouchableOpacity>

      <Text style={s.heading}>What do you want{'\n'}to practise?</Text>
      <Text style={s.sub}>Your tutor will focus on this area.</Text>

      <ScrollView style={s.scroll} contentContainerStyle={s.list}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            style={s.card}
            onPress={() => handleSelect(cat.key)}
            activeOpacity={0.8}
            disabled={loading !== null}
          >
            <View style={s.cardTop}>
              <Ionicons name={cat.icon as any} size={28} color={C.goldMid} />
              <View style={s.cardText}>
                <Text style={s.cardLabel}>{cat.label}</Text>
                <Text style={s.cardSubtitle}>{cat.subtitle}</Text>
              </View>
              {loading === cat.key ? (
                <ActivityIndicator color={C.goldBright} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={C.ash} />
              )}
            </View>
            <View style={s.topics}>
              {cat.topics.map((t) => (
                <View key={t} style={s.topicPill}>
                  <Text style={s.topicText}>{t}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },
  back: { padding: 16 },
  heading: { fontSize: 26, fontWeight: '700', color: C.white, paddingHorizontal: 20, lineHeight: 34 },
  sub: { fontSize: 14, color: C.ash, paddingHorizontal: 20, marginTop: 6, marginBottom: 24 },
  scroll: { flex: 1 },
  list: { paddingHorizontal: 16, gap: 12, paddingBottom: 32 },
  card: {
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.cardBorder,
    borderRadius: 14,
    padding: 18,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  cardText: { flex: 1, marginLeft: 14 },
  cardLabel: { color: C.white, fontSize: 17, fontWeight: '700' },
  cardSubtitle: { color: C.ash, fontSize: 13, marginTop: 2 },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicPill: {
    borderWidth: 0.5,
    borderColor: C.cardBorder,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  topicText: { color: C.ash, fontSize: 12 },
})
```

- [ ] **Step 2: Register screen in RootNavigator**

In `mobile/src/navigation/RootNavigator.tsx`, add the import and screen:

```ts
// Add import after existing englivo screen imports
import TutorConnectPreferenceScreen from '../features/englivo/screens/TutorConnectPreferenceScreen'
```

Inside `<Stack.Navigator>`, after the `EnglivoActiveCall` entry:

```tsx
<Stack.Screen
  name="TutorConnectPreference"
  component={TutorConnectPreferenceScreen}
/>
```

- [ ] **Step 3: Manual test**

Start the app. Navigate to Core home → tap "Call a Tutor". Should show three category cards. Tapping "The Basics" should call `/api/livekit/token?category=basics&mode=human` and navigate to `EnglivoLiveCall`.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/features/englivo/screens/TutorConnectPreferenceScreen.tsx \
        mobile/src/navigation/RootNavigator.tsx
git commit -m "feat: TutorConnectPreferenceScreen — 3 category cards routing to EnglivoLiveCall"
```

---

## Task 12: UpgradeSheet paywall component

**Files:**
- Create: `mobile/src/features/englivo/components/UpgradeSheet.tsx`

- [ ] **Step 1: Install react-native-razorpay**

```bash
cd mobile
npm install react-native-razorpay
npx expo run:ios   # rebuild for native module
```

- [ ] **Step 2: Create UpgradeSheet**

Write `mobile/src/features/englivo/components/UpgradeSheet.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native'
import RazorpayCheckout from 'react-native-razorpay'
import { Ionicons } from '@expo/vector-icons'
import { createSubscription, getMe, type MeResponse } from '../../../api/englivo/quota'

const C = {
  void: '#080C14',
  card: '#111827',
  cardBorder: '#1E2D45',
  goldBright: '#F5C842',
  goldMid: '#E8A020',
  goldDeep: '#B8730A',
  ash: '#8B9AB0',
  white: '#F4F6FA',
  green: '#34D399',
}

const PLANS: {
  key: 'STARTER' | 'PRO' | 'PREMIUM'
  label: string
  price: string
  tutorTime: string
  aiCredits: string
  extras: string[]
  highlight?: boolean
}[] = [
  {
    key: 'STARTER',
    label: 'Starter',
    price: '₹399/mo',
    tutorTime: '2 hrs/week tutor',
    aiCredits: '20 AI credits/mo',
    extras: ['Full Pulse access'],
  },
  {
    key: 'PRO',
    label: 'Pro',
    price: '₹599/mo',
    tutorTime: '5 hrs/week tutor',
    aiCredits: '50 AI credits/mo',
    extras: ['Full Pulse access', 'Priority matching', '1-week rollover'],
    highlight: true,
  },
  {
    key: 'PREMIUM',
    label: 'Premium',
    price: '₹899/mo',
    tutorTime: 'Unlimited tutor',
    aiCredits: '120 AI credits/mo',
    extras: ['Full Pulse access', 'Priority matching', '2-week rollover', 'Session feedback'],
  },
]

interface Props {
  visible: boolean
  onClose: () => void
  onUpgraded: (plan: MeResponse['plan']) => void
  userEmail?: string
  userName?: string
}

export default function UpgradeSheet({ visible, onClose, onUpgraded, userEmail, userName }: Props) {
  const slideAnim = useRef(new Animated.Value(400)).current
  const [buying, setBuying] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [verifyMessage, setVerifyMessage] = useState('')

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : 400,
      useNativeDriver: true,
      tension: 70,
      friction: 12,
    }).start()
  }, [visible])

  async function handleSelect(plan: 'STARTER' | 'PRO' | 'PREMIUM') {
    setBuying(plan)
    try {
      const result = await createSubscription(plan)
      if (result.error) {
        Alert.alert('Error', result.error)
        return
      }

      const RAZORPAY_KEY = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID ?? ''
      await RazorpayCheckout.open({
        key: RAZORPAY_KEY,
        subscription_id: result.subscriptionId,
        name: 'EngR',
        description: `${plan.charAt(0) + plan.slice(1).toLowerCase()} Plan`,
        prefill: {
          email: userEmail ?? '',
          name: userName ?? '',
        },
        theme: { color: C.goldMid },
      })

      // Payment completed — poll /api/me until plan updates (up to 30s)
      setVerifying(true)
      setVerifyMessage('Activating your plan…')

      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000))
        if (i === 3) setVerifyMessage('Verifying payment…')
        try {
          const me = await getMe()
          if (me.plan !== 'FREE') {
            setVerifying(false)
            onUpgraded(me.plan)
            return
          }
        } catch (_) {}
      }

      // 30s elapsed — plan may still activate via webhook
      setVerifying(false)
      Alert.alert(
        'Payment received',
        'Your plan will activate shortly. Pull to refresh if it hasn\'t updated.',
      )
      onClose()
    } catch (err: any) {
      if (err?.code !== 'PAYMENT_CANCELLED') {
        Alert.alert('Payment failed', 'Please try again.')
      }
    } finally {
      setBuying(null)
      setVerifying(false)
    }
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>Upgrade Plan</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.ash} />
            </TouchableOpacity>
          </View>
          <Text style={s.subtitle}>
            30 min free/week used — upgrade for unlimited practice
          </Text>

          {verifying ? (
            <View style={s.verifyState}>
              <ActivityIndicator color={C.goldBright} size="large" />
              <Text style={s.verifyText}>{verifyMessage}</Text>
            </View>
          ) : (
            <ScrollView style={s.planList} contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
              {PLANS.map((plan) => (
                <TouchableOpacity
                  key={plan.key}
                  style={[s.planCard, plan.highlight && s.planCardHighlight]}
                  onPress={() => handleSelect(plan.key)}
                  disabled={buying !== null}
                  activeOpacity={0.85}
                >
                  {plan.highlight && (
                    <View style={s.popularBadge}>
                      <Text style={s.popularText}>Most Popular</Text>
                    </View>
                  )}
                  <View style={s.planRow}>
                    <Text style={s.planLabel}>{plan.label}</Text>
                    <Text style={s.planPrice}>{plan.price}</Text>
                  </View>
                  <Text style={s.planFeature}>{plan.tutorTime}</Text>
                  <Text style={s.planFeature}>{plan.aiCredits}</Text>
                  {plan.extras.map((e) => (
                    <View key={e} style={s.extraRow}>
                      <Ionicons name="checkmark-circle" size={14} color={C.green} />
                      <Text style={s.extraText}>{e}</Text>
                    </View>
                  ))}
                  {buying === plan.key && (
                    <ActivityIndicator
                      color={C.goldBright}
                      style={{ marginTop: 8 }}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
  },
  handle: { width: 36, height: 4, backgroundColor: C.ash, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '700', color: C.white },
  subtitle: { color: C.ash, fontSize: 13, marginBottom: 20 },
  planList: { flex: 1 },
  planCard: {
    backgroundColor: C.void,
    borderWidth: 0.5,
    borderColor: C.cardBorder,
    borderRadius: 14,
    padding: 16,
  },
  planCardHighlight: { borderColor: C.goldMid, borderWidth: 1 },
  popularBadge: {
    backgroundColor: C.goldMid,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  popularText: { color: C.void, fontSize: 11, fontWeight: '700' },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  planLabel: { color: C.white, fontSize: 17, fontWeight: '700' },
  planPrice: { color: C.goldBright, fontSize: 17, fontWeight: '700' },
  planFeature: { color: C.ash, fontSize: 13, marginBottom: 4 },
  extraRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  extraText: { color: C.ash, fontSize: 12 },
  verifyState: { alignItems: 'center', paddingVertical: 48, gap: 16 },
  verifyText: { color: C.ash, fontSize: 15 },
})
```

Also add to `mobile/.env` (or `app.json` extra):
```
EXPO_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxx
```

- [ ] **Step 3: Commit**

```bash
git add mobile/src/features/englivo/components/UpgradeSheet.tsx
git commit -m "feat: UpgradeSheet — Razorpay checkout with 30s polling and verifying state"
```

---

## Task 13: Wire quota check into home screen + call-end deduction

**Files:**
- Modify: `mobile/src/features/englivo/screens/EnglivoHomeScreenV2.tsx`
- Modify: `mobile/src/features/englivo/screens/EnglivoLiveCallScreen.tsx`

- [ ] **Step 1: Update EnglivoHomeScreenV2 — quota check + locked button + route change**

In `mobile/src/features/englivo/screens/EnglivoHomeScreenV2.tsx`, add these imports at the top (after existing imports):

```ts
import { getMe, type MeResponse } from '../../../api/englivo/quota'
import UpgradeSheet from '../components/UpgradeSheet'
import { useUser } from '@clerk/clerk-expo'  // already imported
```

Add state variables inside the component (alongside existing state):

```ts
const { user } = useUser()
const [quota, setQuota] = useState<MeResponse | null>(null)
const [upgradeVisible, setUpgradeVisible] = useState(false)
```

Fetch quota on focus (add alongside existing `useFocusEffect`):

```ts
useFocusEffect(
  useCallback(() => {
    getMe()
      .then(setQuota)
      .catch(console.error)
  }, []),
)
```

Replace the existing "Call a Tutor" / `EnglivoLiveCall` button logic. Find the `onPress` that calls `navigation.navigate("EnglivoLiveCall", ...)` and change it to:

```ts
onPress={() => {
  const isExhausted =
    quota !== null &&
    quota.plan === 'FREE' &&
    quota.quota.remainingSeconds === 0
  if (isExhausted) {
    setUpgradeVisible(true)
  } else {
    navigation.navigate('TutorConnectPreference')
  }
}}
```

Show lock icon when exhausted. Find the call-button icon and update:

```tsx
{quota?.plan === 'FREE' && quota?.quota.remainingSeconds === 0 ? (
  <Ionicons name="lock-closed" size={22} color={C.ash} />
) : (
  <Ionicons name="call-outline" size={22} color={C.goldMid} />
)}
```

Add the `UpgradeSheet` at the bottom of the component's JSX (before closing `</SafeAreaView>`):

```tsx
<UpgradeSheet
  visible={upgradeVisible}
  onClose={() => setUpgradeVisible(false)}
  onUpgraded={() => {
    setUpgradeVisible(false)
    getMe().then(setQuota).catch(console.error)
  }}
  userEmail={user?.primaryEmailAddress?.emailAddress}
  userName={user?.fullName ?? undefined}
/>
```

- [ ] **Step 2: Update EnglivoLiveCallScreen — call-end deduction**

In `mobile/src/features/englivo/screens/EnglivoLiveCallScreen.tsx`, add to imports:

```ts
import { postCallEnd } from '../../../api/englivo/quota'
import { useRef } from 'react'   // already likely imported
import { v4 as uuidv4 } from 'uuid'  // already in dependencies
```

Inside the outer screen component (where `route.params` are destructured), add:

```ts
const route = useRoute<any>()
const { token, roomName, serverUrl, freeMinutesRemaining, category } = route.params ?? {}
const sessionIdRef = useRef<string>(uuidv4())
const callStartRef = useRef<number>(Date.now())
```

Add a cleanup effect that fires `postCallEnd` on unmount:

```ts
useEffect(() => {
  return () => {
    const durationSeconds = Math.floor((Date.now() - callStartRef.current) / 1000)
    if (durationSeconds > 0) {
      postCallEnd(sessionIdRef.current, durationSeconds)
    }
  }
}, [])
```

- [ ] **Step 3: Manual end-to-end test**

1. Fresh free user — tap "Call a Tutor" → `TutorConnectPreferenceScreen` appears.
2. Select "The Basics" → `EnglivoLiveCallScreen` opens with `freeMinutesRemaining=30`.
3. Wait 30 seconds, end call → `postCallEnd` fires → DB `freeSecondsUsed=30`.
4. Tap "Call a Tutor" again → lock icon shows → `UpgradeSheet` opens.
5. Select Pro plan → Razorpay checkout opens (test card: `4111 1111 1111 1111`).
6. Complete payment → "Verifying payment…" shows → after webhook, plan updates → sheet closes.
7. Tap "Call a Tutor" again → no lock → `TutorConnectPreferenceScreen` opens.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/features/englivo/screens/EnglivoHomeScreenV2.tsx \
        mobile/src/features/englivo/screens/EnglivoLiveCallScreen.tsx
git commit -m "feat: quota-gated call button, TutorConnectPreference routing, call-end deduction"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| UserQuota / Subscription / Organization / ProcessedSession models | Task 1 |
| PLAN_QUOTAS config + getMondayUTC + getEffectivePlan | Task 2 |
| resolveQuota helper (shared, lazy reset, rollover guard) | Task 3 |
| GET /api/me | Task 4 |
| GET /api/livekit/token (quota gate + 402) | Task 5 |
| POST /api/sessions/call-end (idempotency via ProcessedSession) | Task 6 |
| POST /api/payments/create-subscription (409/400 duplicate guard) | Task 7 |
| Middleware: webhook public route | Task 7 |
| POST /api/payments/webhook (4 events, Bridge retry) | Task 8 |
| bridgeSync with 3× retry | Task 8 |
| Bridge PATCH /sync/plan endpoint | Task 9 |
| Mobile quota API client | Task 10 |
| TutorConnectPreferenceScreen | Task 11 |
| UpgradeSheet (30s poll, verifying state) | Task 12 |
| Home screen quota check + lock icon | Task 13 |
| Call-end deduction on unmount | Task 13 |
| CANCELLED subscription grace period via getEffectivePlan | Tasks 2 + 8 |
| PREMIUM null remainingSeconds = unlimited | Tasks 3 + 5 |

All spec requirements covered. No placeholders. Types consistent throughout.
