# Core Free Time + Plans + Tutor Connect — Design Spec

> **Deprecation note (2026-04-14):** `archive/web-mvp` is archived and not part of active runtime/deployment. Keep this spec only as historical design context.

> **For agentic workers:** Use superpowers:writing-plans to implement this spec task-by-task.

**Goal:** Give every user 30 minutes of free weekly human-tutor time on Core, enforce it via a quota system, offer 3 individual upgrade plans (₹399/₹599/₹899) plus enterprise team plans via Razorpay, propagate plan status to Pulse through the Bridge API, and add the Tutor Connect preference screen (3 session categories) on mobile.

**Phase:** Phase 1 — Revenue-critical. Phase 2 (AI credit earn/spend loop) is a separate spec.

---

## 1. Plan Tiers

| | Free | Starter ₹399/mo | Pro ₹599/mo | Premium ₹899/mo | Enterprise |
|---|---|---|---|---|---|
| Pulse P2P calls | 3/week | Unlimited | Unlimited | Unlimited | Unlimited |
| Pulse eBites feed | Full | Full | Full | Full | Full |
| Core: human tutor | 30 min/week | 2 hrs/week | 5 hrs/week | Unlimited | Shared pool |
| Core: AI credits/month | 0 | 20 | 50 | 120 | Custom |
| Priority tutor matching | — | — | ✓ | ✓ | ✓ |
| Session summary/feedback | — | — | — | ✓ | ✓ |
| Unused tutor rollover | — | — | 1 week | 2 weeks | — |

**Rollover:** unused tutor seconds from week N carry into week N+1 up to the rollover limit. Rolled-over seconds are consumed first.

**Enterprise:** team-based shared minute pool. Admin assigns seats. Pool size and reset cadence negotiated per contract. Stored as `Organization.poolSeconds`.

---

## 2. Data Model (`archive/web-mvp` — Prisma)

### 2.1 Schema additions

```prisma
model UserQuota {
  id                 String    @id @default(cuid())
  clerkId            String    @unique
  weekStartDate      DateTime  // Monday 00:00 UTC of current window
  freeSecondsUsed    Int       @default(0)
  rolledOverSeconds  Int       @default(0)  // carried from last week, consumed first
  aiCreditsGranted   Int       @default(0)
  aiCreditsUsed      Int       @default(0)
  creditMonthStart   DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
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
  id                     String      @id @default(cuid())
  name                   String
  adminClerkId           String
  razorpayCustomerId     String?
  razorpaySubscriptionId String?
  seatLimit              Int         @default(10)
  poolSeconds            Int         @default(0)   // total shared seconds in billing period
  poolUsedSeconds        Int         @default(0)
  poolResetDate          DateTime?
  status                 SubStatus   @default(ACTIVE)
  members                Subscription[]
  createdAt              DateTime    @default(now())
  updatedAt              DateTime    @updatedAt
}

enum Plan      { FREE STARTER PRO PREMIUM ENTERPRISE }
enum SubStatus { ACTIVE CANCELLED PAST_DUE PAUSED }
```

### 2.2 Quota resolution logic — `resolveQuota(clerkId)`

**This is a shared server-side helper called from both `/api/me` and `/api/livekit/token`.** It runs the lazy weekly reset before returning quota data, so both endpoints always see the correct state.

```ts
// archive/web-mvp/src/lib/resolveQuota.ts
export async function resolveQuota(clerkId: string): Promise<ResolvedQuota> {
  const sub  = await getOrCreateSubscription(clerkId)
  const effectivePlan = getEffectivePlan(sub)  // see § 4.6 — CANCELLED past period → FREE
  const quota = await getOrCreateQuota(clerkId)
  const config = PLAN_QUOTAS[effectivePlan]

  // Lazy weekly reset
  const currentMonday = getMondayUTC(new Date())
  if (quota.weekStartDate < currentMonday) {
    const weeklyLimit = config.weeklyTutorSeconds  // null = unlimited
    // Guard: unlimited plans (null) produce no rollover — no ceiling to carry
    const unused = weeklyLimit !== null
      ? Math.max(0, weeklyLimit - quota.freeSecondsUsed)
      : 0
    const maxRollover = weeklyLimit !== null
      ? weeklyLimit * config.rolloverWeeks
      : 0
    const rollover = Math.min(unused, maxRollover)
    await db.userQuota.update({
      where: { clerkId },
      data: {
        freeSecondsUsed:   0,
        rolledOverSeconds: rollover,
        weekStartDate:     currentMonday,
      },
    })
    quota.freeSecondsUsed   = 0
    quota.rolledOverSeconds = rollover
    quota.weekStartDate     = currentMonday
  }

  const weeklyLimit = config.weeklyTutorSeconds
  const remaining = weeklyLimit === null
    ? null  // unlimited
    : Math.max(0, weeklyLimit - quota.freeSecondsUsed + quota.rolledOverSeconds)

  return { effectivePlan, config, quota, remainingSeconds: remaining }
}
```

`getEffectivePlan` handles the CANCELLED-but-still-in-period edge case (see § 4.6).

---

## 3. Plan Config (`archive/web-mvp/src/lib/planConfig.ts`)

```ts
export const PLAN_QUOTAS = {
  FREE:       { weeklyTutorSeconds: 1800,  monthlyAiCredits: 0,   pulseCallsPerWeek: 3,    rolloverWeeks: 0 },
  STARTER:    { weeklyTutorSeconds: 7200,  monthlyAiCredits: 20,  pulseCallsPerWeek: null,  rolloverWeeks: 0 },
  PRO:        { weeklyTutorSeconds: 18000, monthlyAiCredits: 50,  pulseCallsPerWeek: null,  rolloverWeeks: 1 },
  PREMIUM:    { weeklyTutorSeconds: null,  monthlyAiCredits: 120, pulseCallsPerWeek: null,  rolloverWeeks: 2 },
  ENTERPRISE: { weeklyTutorSeconds: null,  monthlyAiCredits: 0,   pulseCallsPerWeek: null,  rolloverWeeks: 0 },
} as const;
// null = unlimited
```

---

## 4. Backend API Routes (`archive/web-mvp/src/app/api/`)

All routes require Clerk auth (`auth()` from `@clerk/nextjs/server`).

### 4.1 `GET /api/me`

Calls `resolveQuota(clerkId)` first (runs lazy reset), then returns:

```json
{
  "clerkId": "user_xxx",
  "plan": "FREE",
  "status": "ACTIVE",
  "quota": {
    "weeklyLimitSeconds": 1800,
    "usedSeconds": 300,
    "rolledOverSeconds": 0,
    "remainingSeconds": 1500,
    "weekStartDate": "2026-04-14T00:00:00Z"
  },
  "aiCredits": {
    "granted": 0,
    "used": 0,
    "remaining": 0
  },
  "organization": null
}
```

### 4.2 `GET /api/livekit/token`

Query params: `?category=basics|general|business&mode=human|ai`

Logic:
1. Call `resolveQuota(clerkId)` — this runs the lazy reset so quota is always fresh.
2. If `mode=human`:
   - If `remainingSeconds === 0` (and plan is not PREMIUM/ENTERPRISE) → return `{ error: "QUOTA_EXHAUSTED", remainingSeconds: 0 }` (HTTP 402).
3. Issue LiveKit token for room on `wss://ssengst-174tfe9o.livekit.cloud`.
4. Return `{ token, roomName, serverUrl, freeMinutesRemaining, tutorName?, creditsPerMinute? }`.

### 4.3 `POST /api/sessions/call-end`

Body: `{ sessionId: string, durationSeconds: number }`

**Deduplication:** use `sessionId` as an idempotency key. Store processed session IDs on `UserQuota` (or a separate `ProcessedSession` set). If `sessionId` already processed, return 200 with current quota and skip deduction. This means the mobile fire-and-forget and the LiveKit webhook can both fire — only the first one deducts.

Logic:
1. Check `ProcessedSession` table for `sessionId`. If found → return current quota, done.
2. Insert `sessionId` into `ProcessedSession`.
3. Deduct `durationSeconds` from `UserQuota.freeSecondsUsed` (cap at `weeklyLimit`), or from `Organization.poolUsedSeconds` for ENTERPRISE.
4. Return updated quota.
5. Sync Bridge (fire-and-forget — call-end sync is informational, not plan-critical).

```prisma
// Add to schema
model ProcessedSession {
  id            String   @id @default(cuid())
  sessionId     String   @unique
  clerkId       String
  deductedSeconds Int
  processedAt   DateTime @default(now())
}
```

### 4.4 Weekly quota reset

Handled entirely inside `resolveQuota()` — called lazily on `/api/me` and `/api/livekit/token`. No cron needed.

**Rollover guard for unlimited plans:**
```
if weeklyLimit === null → rollover = 0
```
Unlimited plans (PREMIUM, ENTERPRISE) never need rollover — matches spec table.

### 4.5 `POST /api/payments/create-subscription`

Body: `{ plan: "STARTER"|"PRO"|"PREMIUM", billingCycle: "monthly" }`

**Duplicate subscription guard:**
1. Fetch existing `Subscription` for `clerkId`.
2. If `status === ACTIVE` and `plan` is same or higher tier → return HTTP 409 `{ error: "ALREADY_SUBSCRIBED", currentPlan }`.
3. If `status === ACTIVE` and requesting lower tier → return HTTP 400 `{ error: "DOWNGRADE_NOT_SUPPORTED" }`. Downgrades are manual in Phase 1.
4. Otherwise: create/retrieve Razorpay customer, create Razorpay Subscription, return `{ subscriptionId, shortUrl }`.

Note: yearly billing excluded from Phase 1 (added post-launch).

### 4.6 `POST /api/payments/webhook`

Validates Razorpay webhook signature (`X-Razorpay-Signature` header).

**`getEffectivePlan(sub)`** — used by `resolveQuota`:
```ts
function getEffectivePlan(sub: Subscription): Plan {
  if (sub.status === 'CANCELLED' && sub.currentPeriodEnd && new Date() > sub.currentPeriodEnd) {
    return 'FREE'
  }
  return sub.plan
}
```

Events handled:

| Event | Action |
|---|---|
| `subscription.activated` | Set `plan`, `status=ACTIVE`, `currentPeriodEnd`. **Retry Bridge sync up to 3× (2s delay).** |
| `subscription.charged` | Renew `currentPeriodEnd`, grant monthly AI credits. **Retry Bridge sync up to 3× (2s delay).** |
| `subscription.cancelled` | Set `status=CANCELLED`, keep `plan` + `currentPeriodEnd` intact. User retains access until period end — `getEffectivePlan` downgrades to FREE after that. **Retry Bridge sync up to 3× (2s delay).** |
| `subscription.halted` | Set `status=PAST_DUE`. Keep current plan values — Pulse not affected. Bridge sync fire-and-forget. |

**Why retry on payment events but not call-end:** Bridge sync failure on a payment event means Pulse shows wrong plan (user paid but still sees call limit). That's a real UX bug. Call-end sync failure is informational only — Pulse plan status doesn't change.

### 4.7 `POST /api/payments/create-enterprise-order`

Out of scope for Phase 1 mobile — managed manually via web dashboard.

---

## 5. Razorpay Setup

### 5.1 Plans to create in Razorpay dashboard

| Plan ID (slug) | Amount | Interval |
|---|---|---|
| `core_starter_monthly` | ₹39900 (paise) | monthly |
| `core_pro_monthly` | ₹59900 | monthly |
| `core_premium_monthly` | ₹89900 | monthly |

Yearly plans excluded from Phase 1.

### 5.2 Environment variables (`archive/web-mvp/.env`)
```
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx
```

### 5.3 Mobile Razorpay checkout

Use `react-native-razorpay` package. On plan selection:
1. Call `/api/payments/create-subscription` → receive `{ subscriptionId, shortUrl }`.
2. Open `Razorpay.open({ subscription_id: subscriptionId, ... })`.
3. On success callback: poll `/api/me` every 3s up to 30s.
4. Show "Verifying payment…" spinner after 10s so user knows it's still working (Razorpay webhook delivery can take 15–30s in production).
5. On plan change detected in poll response → dismiss spinner, navigate to success state.
6. If 30s elapsed without plan change → show "Payment received — your plan will activate shortly" (don't block the user).

---

## 6. Bridge API Sync

### 6.1 New endpoint on Bridge: `PATCH /sync/plan`

```ts
// Request body
{
  clerkId: string
  plan: "FREE" | "STARTER" | "PRO" | "PREMIUM" | "ENTERPRISE"
  pulseCallsPerWeek: number | null   // null = unlimited
  coreTutorSecondsPerWeek: number | null
  coreAiCreditsMonthly: number
}
```

Bridge stores these on the user record. Existing `GET /user/:clerkId` gains a `plan` field.

### 6.2 When Core syncs to Bridge

| Event | Sync behaviour |
|---|---|
| `subscription.activated` | Retry up to 3× with 2s delay |
| `subscription.charged` | Retry up to 3× with 2s delay |
| `subscription.cancelled` | Sync FREE values immediately (user is still on paid plan but Bridge reflects future state) — retry up to 3× |
| `subscription.halted` | Fire-and-forget — plan values unchanged |
| `call-end` | Fire-and-forget — informational only |

### 6.3 How Pulse uses Bridge plan data

- `pulseCallsPerWeek: null` → unlimited. Pulse tracks call count against this limit for free users.
- Pulse reads plan on session creation via existing `GET /user/:clerkId`.
- Pulse does NOT call Core directly.

---

## 7. Mobile Changes

### 7.1 New screen: `TutorConnectPreferenceScreen`

Route: `EnglivoSessionMode → TutorConnectPreference → EnglivoLiveCall`

Three category cards:

```
┌─────────────────────────────────────┐
│  THE BASICS                          │
│  Grammar                             │
│  Modal verbs • Phrasal verbs         │
│  Idioms • Verb tenses                │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  DAY-TO-DAY                          │
│  General English                     │
│  Travel • Hobbies                    │
│  Entertainment • AI                  │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  GROWTH                              │
│  Business English                    │
│  Presentations • Meetings            │
│  Interviews • Professional sectors   │
└─────────────────────────────────────┘
```

Selected category passed as `?category=basics|general|business` to `/api/livekit/token`.

### 7.2 Quota check before showing TutorConnect button

`EnglivoHomeScreen` calls `GET /api/me` on mount. If `remainingSeconds === 0` and plan is FREE, the "Call a Tutor" button shows a lock icon. Tapping it opens `UpgradeSheet` instead of navigating to `TutorConnectPreference`.

### 7.3 Paywall bottom sheet (`UpgradeSheet`)

Triggered when:
- User taps locked "Call a Tutor" button
- `/api/livekit/token` returns 402 `QUOTA_EXHAUSTED`

Shows 3 plan cards (Starter / Pro / Premium). Tapping a plan calls `/api/payments/create-subscription`, opens Razorpay checkout, then polls `/api/me` per § 5.3.

### 7.4 In-call free time warning

Already implemented in `EnglivoLiveCallScreen` — shows warning at 2 minutes remaining. No changes needed.

### 7.5 Call-end deduction

On `EnglivoLiveCallScreen` unmount: POST to `/api/sessions/call-end` with `{ sessionId, durationSeconds }` — fire-and-forget from mobile. LiveKit webhook also fires the same endpoint. Deduplication via `ProcessedSession` table (§ 4.3) ensures only one deduction occurs regardless of which arrives first.

---

## 8. Tutor Category Routing

`/api/livekit/token?category=basics|general|business` passes category in LiveKit room metadata. Category is stored on the session record and shown to the tutor when they join. Automated category-based tutor matching is Phase 2.

---

## 9. What's NOT in Phase 1

- AI credit earn/spend loop (Phase 2 spec)
- Automated tutor matching by category
- Enterprise admin web portal (manual)
- Yearly billing (added post-launch)
- Downgrade self-service (manual only)
- Referral credits or streak multipliers

---

## 10. Success Criteria

- New user signs in → can immediately start a tutor call → call ends → seconds deducted from quota (exactly once — idempotency key prevents double deduction)
- After 30 min exhausted → lock icon on call button → `UpgradeSheet` appears
- User pays via Razorpay → plan updates within 30s (webhook + poll) → button unlocks
- Bridge `GET /user/:clerkId` returns correct `plan` after upgrade → Pulse lifts call limit
- `pulseCallsPerWeek=null` for any paid user on Bridge
- CANCELLED subscription: user retains access until `currentPeriodEnd`, then downgrades to FREE on next `/api/me` or `/api/livekit/token` call
- PREMIUM user: `resolveQuota` returns `remainingSeconds=null`, rollover=0, no quota gate applied
