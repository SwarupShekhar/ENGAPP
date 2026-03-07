# Testing Dev Build on 2 Devices

Use this checklist so **call analysis** and **low-latency AI tutor** work when testing on two physical devices (e.g. two phones) on the same network.

---

## 1. Same network and backend URL

- Both devices must be on the **same Wi‑Fi** as the machine running Nest + backend-ai.
- In **`mobile/src/api/client.ts`**, set `LOCAL_IP` to your computer’s **LAN IP** (e.g. `172.20.10.13` or from `ifconfig` / System Settings).
- Both devices will use `http://<LOCAL_IP>:3000` for the API and (for WebSocket fallback) `http://<LOCAL_IP>:8001` for the AI tutor WebSocket.

---

## 2. Run backends (on your machine)

**Terminal 1 – Nest (port 3000)**  
```bash
cd backend-nest && npm run start:dev
```
- Ensure `AI_ENGINE_URL` in `.env` is `http://localhost:8001` so Nest can reach backend-ai.

**Terminal 2 – Backend-AI (port 8001)**  
```bash
cd backend-ai && uvicorn app.main:app --host 0.0.0.0 --port 8001
```
- `0.0.0.0` lets both devices reach `http://<LOCAL_IP>:8001` for the AI tutor WebSocket when SSE falls back.

---

## 3. Call analysis (P2P call feedback)

- After a **P2P call**, the session is processed by **`sessions.processor`**.
- **Pronunciation + summary** run only when the session has **`recordingUrl`** (set by LiveKit egress webhook).
- Ensure LiveKit egress is configured and the webhook writes **`recordingUrl`** to the session so the processor can:
  - Download the recording
  - Call backend-ai pronunciation assess
  - Fill **`summaryJson`** (scores, `pronunciation_cefr_cap`, `dominant_pronunciation_errors`, etc.)
  - Update **Analysis** and **session summary**.
- On the app, **Call Feedback** uses **`sessionsApi.getSessionAnalysis(sessionId)`**, which returns the session **including `summaryJson`**. The screen shows scores and the cap banner when `pronunciation_cefr_cap` is set.

---

## 4. Low-latency AI tutor

- The app uses **SSE first**: `tutorApi.streamSpeech(formData)` → Nest **`POST /conversational-tutor/stream-speech`** → Nest proxies to backend-ai **`/api/tutor/stream-response`**.
- You should hear the **first sentence in ~2–3 seconds**; the rest streams while the first plays.
- If SSE fails (e.g. network or 401), the app **falls back to WebSocket**: `streamingTutor.sendText(null, null, audioBase64)` to **`ws://<LOCAL_IP>:8001/api/tutor/ws/<sessionId>`**. Backend-ai must be reachable on that URL (hence `--host 0.0.0.0`).

---

## 5. Quick checks

| Check | What to do |
|-------|------------|
| **Call analysis** | Do a short P2P call, wait for “processing” to finish, open Call Feedback and confirm scores + pronunciation cap banner if applicable. |
| **AI tutor latency** | Open Maya, say a short phrase; confirm transcript appears quickly and first audio plays within a few seconds. |
| **Both devices** | Use the same `LOCAL_IP` in `client.ts`; run Nest and backend-ai on the machine at that IP; both devices on same Wi‑Fi. |

---

## 6. Optional: override API URL for device builds

To avoid editing `LOCAL_IP` in code, you can drive the API base URL from env (e.g. in `app.config.js` or `app.config.ts` with `extra.API_URL`) and read it in `client.ts` so dev builds on both devices use the same backend.
