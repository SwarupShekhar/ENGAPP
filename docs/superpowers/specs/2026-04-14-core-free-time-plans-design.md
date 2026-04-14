# Core Free Time + Plans + Tutor Connect — Design Spec

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

## 2. Data Model (`web-mvp` — Prisma)

### 2.1 Schema additions

```prisma
model UserQuota {
  id                 String    @id @default(cuid())
  clerkId            String    @unique
  weekStartDate      DateTime  // Monday 00:00 UTC of current window
  freeSecondsUsed    Int       @default(0)
  rolledOverSeconds  Int       @default(0)  // carried from last week
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

### 2.2 Quota resolution logic (server-side, not in DB)

```
weeklyLimit(plan)  = PLAN_QUOTAS[plan].weeklyTutorSeconds   // null = unlimited
availableSeconds   = weeklyLimit - freeSecondsUsed + rolledOverSeconds
```

---

## 3. Plan Config (`web-mvp/src/lib/planConfig.ts`)

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

## 4. Backend API Routes (`web-mvp/src/app/api/`)

All routes require Clerk auth (`auth()` from `@clerk/nextjs/server`).

### 4.1 `GET /api/me`
Returns user profile + active plan + current quota status.

Response:
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
1. Resolve user's plan + quota from DB.
2. If `mode=human`:
   - Check `remainingSeconds > 0` (or plan is PREMIUM/ENTERPRISE).
   - If quota exhausted → return `{ error: "QUOTA_EXHAUSTED", remainingSeconds: 0 }` (HTTP 402).
3. Issue LiveKit token for room on `wss://ssengst-174tfe9o.livekit.cloud`.
4. Return `{ token, roomName, serverUrl, freeMinutesRemaining, tutorName?, creditsPerMinute? }`.

### 4.3 `POST /api/sessions/call-end`

Body: `{ sessionId, durationSeconds: number }`

Logic:
1. Deduct `durationSeconds` from `UserQuota.freeSecondsUsed` (or `Organization.poolUsedSeconds` for enterprise).
2. Cap: `freeSecondsUsed` cannot exceed `weeklyLimit`.
3. Return updated quota.
4. Trigger Bridge plan sync (fire-and-forget, non-blocking).

### 4.4 Weekly quota reset

Run on every `GET /api/me` and `GET /api/livekit/token` call:

```
currentMonday = getMondayUTC(now())
if quota.weekStartDate < currentMonday:
  compute rollover = min(unusedSeconds, rolloverLimit(plan))
  reset freeSecondsUsed = 0
  set rolledOverSeconds = rollover
  set weekStartDate = currentMonday
```

No separate cron needed — lazy reset on access.

### 4.5 `POST /api/payments/create-subscription`

Body: `{ plan: "STARTER"|"PRO"|"PREMIUM", billingCycle: "monthly"|"yearly" }`

Logic:
1. Create or retrieve Razorpay customer for this `clerkId`.
2. Create Razorpay Subscription on the matching plan ID.
3. Return `{ subscriptionId, shortUrl }` — mobile opens `shortUrl` in Razorpay checkout.

### 4.6 `POST /api/payments/webhook`

Validates Razorpay webhook signature (`X-Razorpay-Signature`).

Events handled:
| Event | Action |
|---|---|
| `subscription.activated` | Set plan + status ACTIVE, set `currentPeriodEnd`, sync Bridge |
| `subscription.charged` | Renew `currentPeriodEnd`, grant monthly AI credits, sync Bridge |
| `subscription.cancelled` | Set status CANCELLED, downgrade to FREE on `currentPeriodEnd`, sync Bridge |
| `subscription.halted` | Set status PAST_DUE, sync Bridge |

### 4.7 `POST /api/payments/create-enterprise-order`

Creates a Razorpay Order (one-time or recurring) for enterprise. Admin-only. Out of scope for Phase 1 mobile — managed via web dashboard.

---

## 5. Razorpay Setup

### 5.1 Plans to create in Razorpay dashboard

| Plan ID (slug) | Amount | Interval |
|---|---|---|
| `core_starter_monthly` | ₹39900 (paise) | monthly |
| `core_starter_yearly` | ₹399900 | yearly |
| `core_pro_monthly` | ₹59900 | monthly |
| `core_pro_yearly` | ₹599900 | yearly |
| `core_premium_monthly` | ₹89900 | monthly |
| `core_premium_yearly` | ₹899900 | yearly |

### 5.2 Environment variables (`web-mvp/.env`)
```
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx
```

### 5.3 Mobile Razorpay checkout
Use `react-native-razorpay` package. On plan selection, call `/api/payments/create-subscription`, receive `shortUrl`, open with `Razorpay.open({ subscription_id, ... })`. On success callback, poll `/api/me` until plan reflects upgrade (webhook may be slightly delayed — poll up to 10s with 2s interval).

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

Bridge stores these on the user record. Existing `GET /user/:clerkId` response gains a `plan` field.

### 6.2 When Core syncs to Bridge

- After `subscription.activated` webhook
- After `subscription.charged` webhook
- After `subscription.cancelled` (downgrade to FREE values)
- After `subscription.halted` (keep current plan values, Pulse not affected)

### 6.3 How Pulse uses Bridge plan data

- `pulseCallsPerWeek: null` → unlimited. Pulse tracks call count in its own DB against this limit for free users.
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

Selected category is passed as `?category=basics|general|business` to `/api/livekit/token`.

### 7.2 Quota check before showing TutorConnect button

`EnglivoHomeScreen` calls `GET /api/me` on mount. If `remainingSeconds === 0` and plan is FREE, the "Call a Tutor" button shows a lock icon. Tapping it opens the upgrade bottom sheet instead of navigating to TutorConnectPreference.

### 7.3 Paywall bottom sheet (`UpgradeSheet`)

Triggered when:
- User taps locked "Call a Tutor" button (quota exhausted)
- `/api/livekit/token` returns 402 `QUOTA_EXHAUSTED`

Shows 3 plan cards (Starter / Pro / Premium) with monthly/yearly toggle. Yearly shown as `₹Xk/yr (save 20%)`. Tapping a plan calls `/api/payments/create-subscription` then opens Razorpay checkout.

### 7.4 In-call free time warning

Already implemented in `EnglivoLiveCallScreen` — shows warning at 2 minutes remaining. No changes needed here.

### 7.5 Call-end deduction

When `EnglivoLiveCallScreen` unmounts (call ended), POST to `/api/sessions/call-end` with actual elapsed seconds. Fire-and-forget from mobile; also call from server via LiveKit webhook for reliability.

---

## 8. Tutor Category Routing

`/api/livekit/token?category=basics|general|business` passes category to the LiveKit room metadata. The tutor-side app reads room metadata to know which session type was requested. In Phase 1 there is no automated tutor matching by category — the category is stored on the session record and shown to the tutor when they join. Automated category-based matching is Phase 2.

---

## 9. What's NOT in Phase 1

- AI credit earn/spend loop (Phase 2 spec)
- Automated tutor matching by category
- Enterprise admin web portal (enterprise orders handled manually)
- Yearly billing (monthly only for launch; yearly added after validating pricing)
- Referral credits or streak multipliers

---

## 10. Success Criteria

- New user signs in → can immediately start a tutor call → call ends → seconds deducted from quota
- After 30 min exhausted → lock icon on call button → upgrade sheet appears
- User pays via Razorpay → plan updates within 10s (webhook + poll) → button unlocks
- Bridge `GET /user/:clerkId` returns correct `plan` after upgrade → Pulse lifts call limit
- `[Pulse] pulseCallsPerWeek=null` for any paid user
