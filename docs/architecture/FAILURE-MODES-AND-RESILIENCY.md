# EngR — Failure modes, edge cases, and resiliency contracts

**Scope:** What the system does (and should do) when upstream dependencies fail: LiveKit, Azure Speech, AI engine, Redis, Postgres, and network instability on mobile.

**Sources (verified):**
- `backend-nest/src/modules/sessions/sessions.service.ts` (analysis retries + requeue logic)
- `backend-nest/src/modules/livekit/livekit-webhook.controller.ts` (webhook signature parsing + dedupe)
- `backend-nest/src/modules/livekit/livekit.controller.ts` (egress scheduling + DB guardrails)
- `backend-nest/src/modules/chat/chat.gateway.ts` (offline auto-decline, presence TTL)
- `backend-nest/src/modules/conversational-tutor/conversational-tutor.service.ts` (STT/TTS upstream errors)
- `backend-ai/app/main.py` (global exception handler)

---

## 1. Reliability goals (practical)

- **Do not block UX** on AI when possible: return partial data and allow retries.
- **Idempotency** for webhook-driven workflows (LiveKit egress ended can be delivered more than once).
- **Backoff/retry** for AI analysis jobs.
- **Clear user-visible states**: *processing*, *failed*, *retry available*.

---

## 2. AI analysis failures (Nest sessions)

### 2.1 Retry on demand

`GET /sessions/:id/analysis?retry=true` can re-queue analysis if:

- session status is `ANALYSIS_FAILED`
- there is “enough feedback” (transcript content exists)

Behavior:

- Enqueues Bull job: `sessions` queue, job name `process-session`
  - `attempts: 3`
  - exponential backoff: `delay: 2000ms`
  - jobId: `process-session-{sessionId}` (de-duplicates enqueue)
- Updates DB status to `PROCESSING`

### 2.2 Automatic recovery from “stuck processing”

If a session is `PROCESSING` and has **no `Analysis` rows**, and `updatedAt` is older than **45 seconds**, the service can re-queue analysis if transcripts exist in `Feedback`.

This protects against worker crashes or lost jobs.

---

## 3. LiveKit egress webhook failures

### 3.1 Signature validation / parsing

`POST /webhooks/livekit/egress`:

- Reads raw body from Express `rawBody` (Nest is configured with `{ rawBody: true }`).
- Attempts to parse with `WebhookReceiver.receive(payload, authHeader)`.
- If signature validation fails, it attempts again with `skipAuth=true` and logs a warning.
- Non-`egress_ended` events are ignored.

### 3.2 Deduplication

The controller maintains an in-memory `processedEgress` Set:

- If `egressId` already processed, it returns `{ ok: true, duplicate: true }`.
- Entries are evicted after 5 minutes.

**Implication:** multi-instance deployments will need a shared dedupe key (e.g., Redis) to make this robust across replicas.

---

## 4. LiveKit token & egress scheduling edge cases

`POST /livekit/token`:

- If DB user cannot be resolved from Clerk id, it still returns `{ token, roomName }` but logs that egress will not start.
- Room-composite egress:
  - guarded by `ConversationSession.egressId` and an `updateMany` “claim” to avoid starting twice
  - scheduled with a delay (3s) so the room exists
  - if start fails, resets `egressId` to `null` for retry

Per-participant egress is also scheduled and stored on participant fields; if missing, pronunciation rerun may report `no_recording_url`.

---

## 5. Azure Speech STT failures

### 5.1 Realtime audio gateway (`audio`)

- `recognizer.canceled` triggers cleanup of the stream state (stops recognition and drops buffer).
- No explicit client error event is emitted on cancel today; the client should treat missing transcripts as failure and retry start/stop.

### 5.2 Tutor STT (`/conversational-tutor/*`)

Tutor service logs upstream error details and throws in STT paths, which will surface as an HTTP error from Nest for `process-speech` / `transcribe`.

---

## 6. AI engine timeouts / unavailability

Current behavior (observed patterns):

- Nest tutor TTS returns empty string on failure (soft-fail) for some paths.
- Some Nest services throw if upstream errors occur (hard-fail), which means the mobile client must handle 5xx and display retry UI.

**Recommended contract additions (not yet enforced globally):**

- Standardize upstream call timeouts (e.g., 10–30s) and map to:
  - `504` for AI timeout
  - `503` for AI unavailable
- Include `requestId` correlation in error bodies.

---

## 7. Chat / presence failure modes

- Presence uses in-memory map + Redis TTL.
- If Redis is down, presence TTL keys won’t update; gateway still tracks in-memory online users per instance.
- Offline user call invites are auto-declined server-side.

---

## 8. FastAPI global error handling

FastAPI (`backend-ai/app/main.py`) installs:

- global exception handler that logs and returns a structured `StandardResponse` 500 payload with error code `INTERNAL_SERVER_ERROR`.

---

## 9. User-visible states (suggested UI contract)

For session analysis screens:

- `PROCESSING`: show “Analyzing…” + poll `GET /sessions/:id/analysis`
- `ANALYSIS_FAILED`: show retry button → call `GET /sessions/:id/analysis?retry=true`
- `COMPLETED`: render analysis, mistakes, pronunciation issues, tasks

To make this airtight, expose `ConversationSession.status` and a stable “analysis ready” flag in the API response.

