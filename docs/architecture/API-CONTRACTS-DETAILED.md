# EngR — API contracts (detailed)

**Goal:** Provide endpoint-by-endpoint contract details: method, path, auth, content-type, request schema, response schema, and examples, based on code.

**Important:** For endpoints that return raw service objects without explicit DTO typing, the *precise* response shape is “whatever the service returns.” In those cases this doc includes the best-available schema derived from controller/service behavior and points to the owning service for the canonical shape.

**Sources (verified):**
- Controllers under `backend-nest/src/modules/**/**/*.controller.ts`
- DTOs: `backend-nest/src/modules/**/dto/*.ts`
- Gateways: see `REALTIME-EVENTS.md`
- FastAPI router mounts from `backend-ai/app/main.py` and route files under `backend-ai/app/features/**/routes.py`

---

## 1. Conventions

### 1.1 Auth

- **Nest guarded routes**: require `Authorization: Bearer <Clerk JWT>` and populate `req.user` via `ClerkGuard`.
- **Unguarded routes**: do not require auth (some exist for internal calls/testing).

### 1.2 Content types

- **JSON**: `application/json`
- **Audio upload**: `multipart/form-data` with field name `audio` (Nest uses `FileInterceptor('audio')`)

### 1.3 Base URLs

- Nest API: `{NEST_ORIGIN}` (Swagger UI at `{NEST_ORIGIN}/api`)
- AI API: `{AI_ORIGIN}` (FastAPI OpenAPI at `{AI_ORIGIN}/docs` in non-prod)

---

## 2. Nest API — `conversational-tutor`

Base: `/conversational-tutor` (guarded)

### `POST /conversational-tutor/start-session`

- **Auth**: required
- **Body**: none
- **Response**: from `ConversationalTutorService.startSession(userId)`

### `POST /conversational-tutor/process-speech`

- **Auth**: required
- **Content-Type**: `multipart/form-data`
- **Form fields**
  - `audio`: file (required)
  - `sessionId`: string (required)
- **Response**: from `processSpeechWithIntent(audioBytes, userId, sessionId)`; includes tutor response and intent fields (see service)

### `POST /conversational-tutor/stream-speech`

- **Auth**: required
- **Content-Type**: `multipart/form-data`
- **Form fields**: same as `process-speech`
- **Response**: `text/event-stream` (SSE) proxied/streamed by Nest through `pipeStreamSpeechResponse(...)`

### `POST /conversational-tutor/transcribe`

- **Auth**: required
- **Content-Type**: `multipart/form-data`
- **Form fields**
  - `audio`: file (required)
- **Response**

```json
{ "text": "string", "phonetic_insights": { "any": "json (optional)" } }
```

### `POST /conversational-tutor/assess-pronunciation`

- **Auth**: required
- **Content-Type**: `multipart/form-data`
- **Form fields**
  - `audio`: file (required)
  - `sessionId`: string (required)
  - `referenceText`: string (required)
- **Response**: from `tutorService.assessPronunciation(audioBytes, referenceText, sessionId)`

### `POST /conversational-tutor/debug-phonemes`

- **Auth**: required
- **Content-Type**: `multipart/form-data`
- **Form fields**
  - `audio`: file (required)
  - `phrase`: string (required)

### `POST /conversational-tutor/append-turn`

- **Auth**: required
- **Body (JSON)**

```json
{ "sessionId": "string", "userText": "string", "aiText": "string" }
```

- **Response**

```json
{ "ok": true }
```

### `POST /conversational-tutor/end-session`

- **Auth**: required
- **Body (JSON)**: `EndSessionDto`

```json
{ "sessionId": "string" }
```

- **Response**: from `tutorService.endSession(sessionId)`

---

## 3. Nest API — `sessions`

Base: `/sessions`

### `POST /sessions/start`

- **Auth**: not enforced in controller (currently unguarded)
- **Body**

```json
{ "matchId": "string", "participants": ["<userId>", "..."], "topic": "string", "estimatedDuration": 600 }
```

- **Response**: `SessionsService.startSession(data)`

### `PUT /sessions/:id/heartbeat`

- **Auth**: not enforced in controller (currently unguarded)
- **Body**

```json
{ "userId": "<internalUserId>" }
```

### `GET /sessions`

- **Auth**: required
- **Response**: `SessionsService.getUserSessions(req.user.id)`

### `GET /sessions/:id/analysis`

- **Auth**: required
- **Query**
  - `retry` (optional): `1|true` triggers re-queue logic for failed/stuck sessions
- **Response**: `SessionsService.getSessionAnalysis(sessionId, req.user.id, { retry })`

### `POST /sessions/:id/pronunciation/rerun`

- **Auth**: required
- **Response**: `SessionsService.rerunPronunciationForSession(sessionId, req.user.id)`

### `POST /sessions/:id/end`

- **Auth**: required
- **Body**

```json
{
  "actualDuration": 600,
  "userEndedEarly": false,
  "audioUrls": { "<internalUserId>": "https://..." },
  "transcript": [{ "speaker_id": "string", "text": "string", "timestamp": "string (optional)" }]
}
```

### `POST /sessions/:id/tasks/generate`

- **Auth**: required
- **Response**

```json
{ "tasks": [/* task objects */] }
```

### `POST /sessions/:id/participant/:userId/audio`

- **Auth**: not enforced in controller (currently unguarded)
- **Body**

```json
{ "audioUrl": "https://..." }
```

### `POST /sessions/upload-audio`

- **Auth**: not enforced in controller (currently unguarded)
- **Body**

```json
{ "audioBase64": "string", "userId": "<internalUserId>", "sessionId": "<sessionId>" }
```

---

## 4. Nest API — `chat` (REST)

Base: `/chat` (guarded)

### `GET /chat/conversations`

- **Response**: `ChatService.getUserConversations(req.user.id)`

### `POST /chat/find-or-create`

- **Body**

```json
{ "targetUserId": "<internalUserId>" }
```

- **Response**

```json
{ "conversationId": "<uuid>" }
```

### `GET /chat/conversations/:conversationId/messages`

- **Query**
  - `limit` default 30
  - `before` message id/timestamp cursor (see service)

### `GET /chat/unread-count`

```json
{ "count": 0 }
```

### `POST /chat/conversations/:conversationId/read`

- **Response**: `ChatService.markAsRead(conversationId, userId)`

---

## 5. Nest API — reels / weakness activity

Base: `/reels` (guarded)

### `GET /reels/feed?cursor=<number>`

- **Response**

```json
{
  "items": [/* reel cards */],
  "nextCursor": 10,
  "totalAvailable": 123
}
```

### `POST /reels/activity/submit`

- **Body**

```json
{ "reelId": "string", "isCorrect": true, "topicTag": "past-tense" }
```

### `POST /reels/watch`

- **Body**

```json
{ "strapiReelId": 123, "completed": true }
```

- **Response**

```json
{ "success": true }
```

---

## 6. Nest API — assessment

Base: `/assessment` (guarded)

### `POST /assessment/start`

- **Body**: none

### `POST /assessment/submit`

- **Body**: `SubmitPhaseDto`

```json
{
  "assessmentId": "string",
  "phase": "PHASE_1 | PHASE_2 | PHASE_3 | PHASE_4",
  "audioBase64": "string",
  "attempt": 1
}
```

### `GET /assessment/dashboard`

### `GET /assessment/:id/results`

---

## 7. Nest API — LiveKit

Base: `/livekit`

### `POST /livekit/token`

- **Body**

```json
{ "userId": "<clerkUserId>", "sessionId": "<conversationSessionId>" }
```

- **Response**

```json
{ "token": "string", "roomName": "room_<sessionId>" }
```

*(May include other fields; see controller/service.)*

---

## 8. FastAPI — AI engine (high-signal endpoints)

Base prefixes from `backend-ai/app/main.py`:

- `POST /api/transcribe` (JSON): `{ "audio_url": "...", "session_id": "..." }`
- `POST /api/analyze` (JSON): `{ "transcript": "...", "session_id": "...", "user_id": "..." }`
- `POST /api/analyze-joint` (JSON): joint analysis schema (see FastAPI `/docs`)
- `POST /api/pronunciation/assess` (multipart or JSON containing azure_result)
- Tutor:
  - `POST /api/tutor/stt` (JSON): `{ audio_base64, user_id }`
  - `POST /api/tutor/tts` (JSON): `{ text, gender }`
  - `POST /api/tutor/stream-response` (multipart + SSE)
  - `WS /api/tutor/ws/{session_id}`

**Canonical schema** for FastAPI is the OpenAPI at `/docs` (non-prod) because it uses `response_model=StandardResponse[...]` types.

