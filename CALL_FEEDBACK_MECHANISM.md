# Call Feedback Mechanism – End-to-End

This document describes how P2P call feedback works from call end to the screen each user sees, so you can review or get a second opinion on the design.

---

## 1. In-call transcript (mobile)

- **Source:** Each device runs on-device speech recognition (Local STT) and shows a live transcript.
- **Labels:** Each line is either **You** (local user) or **Partner** (remote). Partner lines come from the other device via LiveKit `publishData` (type: `"transcription"`).
- **State:** Transcript is kept in React state and in `transcriptRef`. All updates (local final/interim and remote) go through `transcriptRef` so partner lines are not lost when local and remote updates race.
- **On end call:** We flush any pending interim, wait ~80 ms, then read `transcriptRef.current`, **filter to local user only** (`speaker === "user"`), and send **only those segments** as `transcript: [{ speaker_id, text, timestamp }]` in the end-session request. Partner lines are **not** sent (LiveKit data is unreliable at disconnect); the partner’s device is the authority for their own speech.

---

## 2. Ending the session (mobile → Nest)

- **API:** `POST /sessions/:sessionId/end` (authenticated via ClerkGuard).
- **Body:** `{ transcript: { speaker_id, text, timestamp }[], actualDuration?, userEndedEarly? }`
- **Transcript format:** Array of segments for **this device’s user only**. Each item: `{ speaker_id: currentUserId (Clerk id), text: string, timestamp?: string }`. No "Partner" lines.
- **Who sends:** **Each device** sends only its own speech when the user ends the call (or on disconnect). The backend does **not** overwrite the other participant’s data: it upserts one **Feedback** row per participant (keyed by `sessionId` + `participantId`).

---

## 3. Nest: session end handler

- **Where:** `SessionsService.endSession(sessionId, userId, data)`
- **Steps:**
  1. Resolve **participantId** from the session and `userId` (caller from auth).
  2. Normalize `data.transcript` to an array of segments (filter empty text).
  3. **Upsert** one `Feedback` row by `(sessionId, participantId)` with `transcript` = that array (JSON). Do **not** overwrite the other participant’s Feedback.
  4. Update session: `status = PROCESSING`, `endedAt`, `duration`.
  5. Enqueue one job: `process-session` with `{ sessionId, participantIds, audioUrls }` (no transcript in job; processor reads from Feedback table).
- **Result:** Session is `PROCESSING`, one Feedback row per participant (each with that participant’s own segments), and one job in the queue.

---

## 4. Sessions processor (background job)

- **Trigger:** Bull job `process-session`.
- **Transcript source:** **Only** from the **Feedback** table: `findMany({ where: { sessionId }, include: { participant: true } })`.
- **Wait for both:** If `feedbacks.length < session.participants.length`, re-queue with a **delay** (10 s) and **return** — unless `waitAttempts` has reached **6** (60 s total window), then proceed with whatever feedbacks exist so the job doesn’t run forever if one device never calls `end`.
- **Job deduplication:** `endSession` and retry/recovery enqueue with `jobId: process-session-${sessionId}` so the second device’s `end` doesn’t create a duplicate job; Bull ignores a second add with the same ID.
- **Merge segments:** Once both (or all) participants have a Feedback row, build **segments** by flattening each feedback’s `transcript` array and setting `speaker_id` from that feedback’s `participant.userId`. No string diarization.
- **If no segments:** Create minimal "no speech" Analysis rows per participant, set session to `COMPLETED`, exit.
- **If segments exist:**
  1. Call `analyzeAndStoreJoint(sessionId, audioUrls, undefined, segments)` (segments path; no "User"/"Partner" parsing).
  2. **Joint AI:** `brain.analyzeJoint(sessionId, segments)` returns `participant_analyses[]`; store one **Analysis** per participant plus **Mistake** rows.
  3. **Pronunciation (optional):** If `recordingUrl` exists, run pronunciation assessment using a merged transcript string (from segments) and update `summaryJson` and first participant’s Analysis scores.
- **Important:** Each device is the **authoritative source** for its own speech. Diarization is exact because each Feedback row is already per participant; merging is a simple concatenation of segment arrays.

---

## 5. How each user gets their own feedback (Nest)

- **API:** `GET /sessions/:sessionId/analysis` (authenticated).
- **Where:** `SessionsService.getSessionAnalysis(sessionId, userId)`.
- **Logic:** Load session with `analyses` (and `mistakes`, `pronunciationIssues`) and `feedbacks`. Find the **participant** for `userId`. Reorder `session.analyses` so that **the current user’s analysis is first** (`session.analyses[0]` = my analysis). Return the session (with summaryJson, etc.). Retry/recovery re-queues the job without transcript; the processor reads from the Feedback table.
- The mobile app uses `session.analyses[0]` as "my" analysis.

---

## 6. Call feedback screen (mobile)

- **Data:** From `getSessionAnalysis`: `session` with `analyses[0]` = my analysis, `summaryJson` (if set by processor).
- **Shown:**
  - **Overall score & CEFR** (from `summaryJson` or `analyses[0].scores`).
  - **"What this score means"** (short blurb by score band).
  - **Score breakdown** (Pronunciation, Grammar, Vocabulary, Fluency) with **"Why this score?"** per dimension.
  - **Conversation transcript** (with mistakes highlighted if we have them).
  - **Words to work on** (pronunciation issues / dominant errors from analysis or summaryJson).
  - **Key mistakes** (from `analyses[0].mistakes`: original, corrected, explanation).
  - **Strengths / improvement areas** (from `rawData`).
  - **AI summary** (from `rawData.aiFeedback` string).
- **Per-participant:** The screen is designed to show **one** user’s feedback (the logged-in user). So each device shows that device’s user’s analysis because the API returns "my" analysis first.

---

## 7. Where "same score" or wrong feedback can come from (after fix)

1. **Joint AI:** If the AI returns very similar metrics for both participants, both users will see similar numbers; the backend still serves different Analysis rows.
2. **UI bug:** If the app used `analyses[0]` without the backend reordering, one user could see the other’s analysis. With Nest putting "my" analysis first, the client should use the first analysis.
3. **Missing partner transcript:** If one device never calls `end` (e.g. app killed), the processor will eventually run with only one Feedback row; the other participant gets "no speech" or minimal text. The processor waits (re-queue with delay) for both feedbacks before analyzing.

---

## 8. Architecture summary (per-device transcript)

- **Transcript ownership:** Each device sends **only its own** speech. Nest stores one **Feedback** per participant (`sessionId` + `participantId`), with `transcript` = JSON array of segments. No "last writer wins."
- **Diarization:** Not needed from a single string; segments are already per participant. The processor merges segment arrays from all Feedback rows and passes them to the joint AI.
- **Per-participant scoring:** The joint AI receives segments with correct `speaker_id` (from each feedback’s participant). Mobile shows `analyses[0]` after backend puts "my" analysis first.
- **Pronunciation:** Still applied to one participant (e.g. first) and written into `summaryJson`; can be extended to run per participant if needed.

---

## 9. Summary table

| Part | Responsibility |
|------|-----------------|
| In-call transcript | Local STT + partner via LiveKit; labels "You" / Partner; ref-based state. |
| End call | Send **only my segments** `[{ speaker_id, text, timestamp }]` to `POST /sessions/:id/end` (auth required). |
| Nest endSession | Resolve participant from userId; upsert Feedback by (sessionId, participantId); set PROCESSING; enqueue process-session (no transcript in job). |
| Processor | Load feedbacks for session; wait for both participants (re-queue with delay if not); merge segments from all feedbacks; call analyzeAndStoreJoint with segments; create one Analysis per participant; optional pronunciation → summaryJson. |
| getSessionAnalysis | Return session with "my" analysis first (by userId); retry/recovery re-queues job (processor reads from Feedback). |
| Call feedback screen | Show overall score, breakdown, transcript, words to work on, mistakes, strengths, AI summary (from my analysis + summaryJson). |

This is the full call feedback mechanism with per-device transcript ownership and merged analysis.
