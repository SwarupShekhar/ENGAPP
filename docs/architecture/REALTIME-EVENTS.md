# EngR — Realtime event contracts (Socket.IO + WS + SSE)

**Scope:** Concrete event names, payload schemas, acks, and heartbeats as implemented in `backend-nest` gateways and `backend-ai` streaming endpoints.

**Sources (verified):**
- `backend-nest/src/modules/chat/chat.gateway.ts` (Socket.IO namespace `/chat`)
- `backend-nest/src/modules/livekit/realtime-audio.gateway.ts` (Socket.IO namespace `audio`)
- `backend-ai/app/features/tutor/streaming_routes.py` (SSE + WebSocket)

---

## 1. Socket.IO — Chat namespace (`/chat`)

### 1.1 Connection / authentication

- **Namespace**: `/chat`
- **Transports**: `['websocket', 'polling']`
- **Auth handshake**: `handshake.auth.token`
  - Verified via Clerk (`ClerkService.verifyToken`)
  - Clerk `userId` is resolved to internal DB user by `User.clerkId`

**On successful connect**, server will:
- Join socket to personal room: `user:{internalUserId}`
- Emit **`me`**:

```json
{ "id": "<internalUserId>" }
```

**Presence**:
- On first socket per user, server broadcasts `presence_update` to **all** clients.
- Online status is also written to Redis key `online:{userId}` with TTL.

### 1.2 Rooms

- **Conversation room**: `conversation:{conversationId}`
- **Per-user room**: `user:{userId}` (for global badges/notifications)

---

## 1.3 Client → Server events (subscribe messages)

### `join_conversation`

- **Purpose**: Join room `conversation:{conversationId}`
- **Payload**

```json
{ "conversationId": "<uuid>" }
```

- **Ack**

```json
{ "success": true }
```

---

### `send_message`

- **Purpose**: Persist message + broadcast to room + broadcast to each participant’s `user:{id}` room
- **Payload**

```json
{
  "conversationId": "<uuid>",
  "content": "string",
  "type": "text | call_invite | ... (optional)",
  "metadata": { "any": "json (optional)" }
}
```

- **Ack**

```json
{ "success": true, "messageId": "<uuid>" }
```

- **Failure ack**

```json
{ "success": false, "error": "string" }
```

---

### `typing_start` / `typing_stop`

- **Purpose**: Emit typing indicator to other users in same conversation room
- **Payload**

```json
{ "conversationId": "<uuid>" }
```

- **Ack**: none (fire-and-forget)

---

### `heartbeat`

- **Purpose**: Refresh presence TTL in Redis and ensure in-memory map contains socket
- **Payload**: none
- **Ack**

```json
{ "success": true }
```

---

### `mark_read`

- **Purpose**: Mark conversation as read for current user, then notify others
- **Payload**

```json
{ "conversationId": "<uuid>" }
```

- **Ack**

```json
{ "success": true }
```

---

### `send_call_invite`

- **Purpose**: Create a `call_invite` message; notify other participant(s) with `incoming_call` if online; otherwise auto-decline
- **Payload**

```json
{
  "conversationId": "<uuid>",
  "callId": "<string>",
  "callType": "voice | video"
}
```

- **Ack**

```json
{ "success": true, "messageId": "<uuid>" }
```

---

### `accept_call`

- **Purpose**: Accept a direct call; creates a **real DB session** and notifies initiator with `call_status_update`
- **Payload**

```json
{ "conversationId": "<uuid>" }
```

- **Ack**

```json
{ "success": true, "sessionId": "<conversationSessionId>" }
```

---

### `decline_call`

- **Purpose**: Decline call; notify other participant(s)
- **Payload**

```json
{ "conversationId": "<uuid>" }
```

- **Ack**: none (implementation emits status update; handler doesn’t return a structured response)

---

### `get_online_users`

- **Purpose**: Return the internal userIds currently online (in-memory)
- **Payload**: none
- **Ack**

```json
{ "success": true, "onlineUserIds": ["<uuid>", "..."] }
```

---

## 1.4 Server → Client events

### `me`

```json
{ "id": "<internalUserId>" }
```

### `presence_update` (broadcast)

```json
{
  "userId": "<uuid>",
  "status": "online | offline",
  "lastSeen": "ISO-8601"
}
```

### `new_message`

Emitted to:
- `conversation:{conversationId}` for active chat screens
- `user:{participantUserId}` for global badge notification delivery

```json
{
  "conversationId": "<uuid>",
  "message": { "id": "<uuid>", "content": "string", "type": "string", "metadata": {}, "createdAt": "..." }
}
```

*(Exact `message` shape is the persisted Prisma `Message` record returned by `ChatService.saveMessage`.)*

### `user_typing`

```json
{
  "conversationId": "<uuid>",
  "userId": "<uuid>",
  "userName": "string",
  "isTyping": true
}
```

### `messages_read`

```json
{
  "conversationId": "<uuid>",
  "readByUserId": "<uuid>",
  "readAt": "ISO-8601"
}
```

### `incoming_call`

```json
{
  "conversationId": "<uuid>",
  "initiatorId": "<uuid>",
  "initiatorName": "string",
  "callType": "voice | video",
  "sessionId": "<conversationId (temporary)>"
}
```

### `call_status_update`

```json
{
  "conversationId": "<uuid>",
  "status": "accepted | declined",
  "sessionId": "<conversationSessionId (present when accepted)>",
  "responderId": "<uuid>",
  "reason": "string (optional)"
}
```

---

## 2. Socket.IO — Realtime audio namespace (`audio`)

### 2.1 Connection / authentication

- **Namespace**: `audio`
- **Auth handshake**: `handshake.auth.token` verified via Clerk.

### 2.2 Client → Server events

#### `startStream`

```json
{ "userId": "<internalUserId>", "sessionId": "<conversationSessionId>", "language": "en-US (optional)" }
```

Ack:

```json
{ "status": "started" }
```

#### `audioData`

- Payload: binary chunk (ArrayBuffer/Buffer); server pushes into Azure PushAudioInputStream and buffers in memory.

#### `stopStream`

Ack:

```json
{ "status": "stopped", "url": "https://.../sessions/<sessionId>/<userId>.wav" }
```

Or:

```json
{ "status": "not_found" }
```

### 2.3 Server → Client events

#### `transcription`

```json
{ "text": "string", "isFinal": true, "timestamp": "ISO-8601" }
```

---

## 3. FastAPI tutor streaming (SSE + WebSocket)

### 3.1 SSE: `POST /api/tutor/stream-response`

- **Content-Type**: `multipart/form-data`
  - `audio`: file
  - `session_id`: string
  - `user_id`: string
  - `conversation_history`: JSON string array (optional)
- **Response**: `text/event-stream` where each event is JSON in `data`.

Event payload types:

```json
{ "type": "transcript", "text": "..." }
{ "type": "sentence", "text": "...", "audio": "<base64 optional>" }
{ "type": "done" }
{ "type": "error", "message": "..." }
```

### 3.2 WebSocket: `/api/tutor/ws/{session_id}`

- Accepts JSON messages; supports either `text` or `audio_base64` (server can STT on the fly).
- Emits `transcription` and chunked response messages (see `streaming_routes.py` for exact behavior).

---

## 4. Reconnection and idempotency notes

- **Chat presence**: maintained via in-memory `onlineUsers` + Redis TTL keys (`online:{userId}`) refreshed by `heartbeat`.
- **Call invite**: if recipient offline, server auto-declines and notifies initiator (`call_status_update` with reason).
- **Audio streaming**: server buffers audio chunks in memory; `stopStream` uploads combined audio and returns the blob URL.

