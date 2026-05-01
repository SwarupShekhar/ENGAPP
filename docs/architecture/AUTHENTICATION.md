# EngR — Authentication & identity architecture (Clerk)

**Scope:** How the EngR system authenticates users end-to-end: mobile token acquisition, Nest verification, user provisioning into Postgres, and how realtime gateways authenticate.

**Sources (verified):**
- `backend-nest/src/modules/auth/clerk.guard.ts` (`ClerkGuard`)
- `backend-nest/src/integrations/clerk.service.ts` (`ClerkService`)
- `backend-nest/src/modules/chat/chat.gateway.ts` (Socket.IO `/chat` auth)
- `backend-nest/src/modules/livekit/realtime-audio.gateway.ts` (Socket.IO `audio` auth)
- Prisma: `User.clerkId` unique in `backend-nest/src/database/prisma/schema.prisma`

---

## 1. Identity model

There are two distinct identifiers used across the system:

- **Clerk user id** (string like `user_...`)
  - Stored in DB as `User.clerkId`
  - Used as identity for some external systems (e.g., LiveKit participant identity)
- **Internal user id** (UUID)
  - Primary key in Postgres: `User.id`
  - Used for all internal relations (sessions, messages, friendships, scores, etc.)

---

## 2. Mobile → Nest (REST) authentication flow

### 2.1 Request format

- Client sends:
  - `Authorization: Bearer <token>`

### 2.2 Verification (`ClerkGuard`)

For guarded controllers, Nest:

1. Extracts the bearer token
2. Calls `ClerkService.verifyToken(token)`
3. If verification fails → `401 Unauthorized`
4. If verification succeeds:
   - Calls `AuthService.validateUser(session.userId)` to **ensure DB user exists / is synced**
   - Attaches internal user object to `request.user`

**Result:** all downstream controllers use `req.user.id` as the **internal UUID**, and `req.user.clerkId` as the Clerk id.

---

## 3. Realtime authentication (Socket.IO)

### 3.1 `/chat` namespace (`ChatGateway`)

- Client connects with:
  - `handshake.auth.token`
- Server verifies via `ClerkService.verifyToken(token)`
- Server resolves internal user:
  - `User.findUnique({ where: { clerkId: session.userId } })`
- Server emits:
  - `me: { id: <internalUserId> }`
- Server joins:
  - `user:<internalUserId>` room

### 3.2 `audio` namespace (`RealtimeAudioGateway`)

- Same handshake token verification pattern via Clerk
- Stores verified user info on `client.data.user`

---

## 4. Special case: test tokens

`ClerkService.verifyToken` accepts tokens that begin with `TEST_TOKEN_` for E2E testing.

- Example token: `TEST_TOKEN_1`
- Mapped user id: `user_1`

This bypass is convenient for local/dev testing but must be treated as a **security risk** if enabled in production contexts (ensure production ingress cannot supply arbitrary test tokens).

---

## 5. Provisioning / sync (DB user creation)

The guard delegates to `AuthService.validateUser(clerkUserId)` which is the sync point responsible for:

- Creating a `User` row if missing
- Or updating profile fields if needed (depending on implementation)

The schema enforces:

- `User.clerkId` is **unique**
- Many features depend on resolving from Clerk → internal user id (chat gateway, LiveKit token controller)

---

## 6. LiveKit identity note

`POST /livekit/token` accepts `{ userId, sessionId }` where `userId` is treated as **Clerk user id** and becomes the LiveKit participant identity. The controller then resolves Clerk id → internal user id for egress/session bookkeeping.

---

## 7. Threat model / hardening checklist (recommended)

- **Disable or gate `TEST_TOKEN_*`** in non-dev environments.
- Ensure all realtime gateways enforce token verification (they do today).
- Ensure AI backend endpoints that should not be public are protected (currently FastAPI exposes `/api/*` without end-user auth by default; rely on network isolation or add a service token / JWT verification).

