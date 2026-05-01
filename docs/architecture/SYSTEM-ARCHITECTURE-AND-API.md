# System Architecture & API Contracts

This document provides a technical deep-dive into the EngR App's system architecture, including component interactions and API specifications.

## 1. 3-Node Architecture

The EngR ecosystem is divided into three primary nodes, each with a specific responsibility:

### A. Mobile Client (`mobile/`)
- **Framework:** React Native (Expo)
- **Primary Duties:**
  - UI/UX rendering using custom theme tokens.
  - Real-time audio processing (recording, streaming).
  - LiveKit integration for VoIP and room management.
  - WebSocket client for real-time signaling and presence.
  - Secure storage of authentication tokens (Clerk).

### B. Core Backend (`backend-nest/`)
- **Framework:** NestJS (TypeScript)
- **Primary Duties:**
  - Orchestration of business logic.
  - User management and profile persistence (Prisma/PostgreSQL).
  - Matchmaking and session lifecycle management.
  - Integration with external services:
    - **LiveKit:** Room creation and webhook handling.
    - **Strapi:** Content management for eBites (Reels).
    - **Mux:** Video asset hosting and delivery.
    - **Redis:** Real-time caching and session state.
  - Communication with the AI Backend for analysis tasks.

### C. AI Backend (`backend-ai/`)
- **Framework:** FastAPI (Python)
- **Primary Duties:**
  - Heavy-duty NLP and Audio processing.
  - **Transcription:** Azure Speech SDK (STT).
  - **Analysis:** Google Gemini Pro for CEFR assessment and mistake identification.
  - **Tutor Logic:** Specialized "Priya" persona agent for Hinglish conversation.
  - **TTS:** Multi-voice concatenation (Hindi + English) for natural responses.

---

## 2. API Contracts (AI Microservice)

The AI Backend exposes a RESTful API (and WebSocket for streaming tutor sessions) used primarily by the NestJS core.

### General Response Wrapper
All responses follow a standard structure:
```json
{
  "success": boolean,
  "data": T,
  "error": {
    "code": string,
    "message": string,
    "details": object
  },
  "meta": {
    "processing_time_ms": number,
    "request_id": string
  }
}
```

### Key Endpoints

#### `POST /api/analyze`
Analyzes a text transcript for grammatical errors and CEFR level.
- **Request Body:** `AnalysisRequest`
  - `text`: string
  - `user_id`: string
  - `session_id`: string
  - `task_type`: "GENERAL" | "IMAGE_DESCRIPTION" | "REEL_PRACTICE"
- **Response Data:** `AnalysisResponse`
  - `cefr_assessment`: object (level, score, reason)
  - `errors`: array of `ErrorDetail` (original, corrected, explanation, type)
  - `metrics`: object (fluency, vocabulary, grammar)
  - `strengths`/`improvement_areas`: string[]

#### `POST /api/pronunciation`
Performs detailed phonetic analysis of an audio file against reference text.
- **Request Body:** `PronunciationRequest`
  - `audio_url` or `audio_base64`: string
  - `reference_text`: string
  - `language`: string (default "en-US")
- **Response Data:** `PronunciationResponse`
  - `accuracy_score`: 0-100
  - `fluency_score`: 0-100
  - `words`: array of `WordPronunciation` (includes phoneme-level accuracy)
  - `detailed_errors`: object (mispronounced_words, weak_phonemes)

#### `POST /api/tutor/chat`
Non-streaming chat interaction with the AI Tutor.
- **Request Body:** `TutorChatRequest`
  - `message`: string
  - `session_id`: string
  - `user_id`: string
- **Response Data:** `TutorChatResponse`
  - `response_text`: string (Hinglish)
  - `audio_url`: string (TTS generated)
  - `corrections`: array of gentle feedback

---

## 3. Communication Protocols

1.  **REST (HTTPS):** Used for most CRUD operations and high-latency AI tasks.
2.  **WebSockets (Socket.io):**
    - **NestJS Gateway:** Handles matchmaking, real-time notifications, and chat messaging.
    - **AI Tutor Streaming:** Bi-directional audio/text stream for low-latency tutoring.
3.  **Webhooks:**
    - **LiveKit:** Notifies `backend-nest` of room events (participant joined/left, recording finished).
    - **Clerk:** Syncs user authentication events to the local database.

---

## 4. Middleware & Security

- **Request Tracking:** `RequestIDMiddleware` propagates a unique ID across service boundaries for log correlation.
- **Rate Limiting:** Implemented in NestJS via `ThrottlerModule` (Redis-backed).
- **Authentication:** JWT verification via Clerk at the API Gateway (NestJS).
- **AI Authentication:** Internal service-to-service API Key verification.
