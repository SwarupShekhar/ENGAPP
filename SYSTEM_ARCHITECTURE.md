# EngR App - System Architecture & Context Report

This document serves as a comprehensive overview of the EngR App ecosystem, detailing the architecture, components, and system designs for key features like Call Analysis, the AI Tutor, and the personalized eBites Reel Engine. This context is intended for LLMs and IDEs to understand the broader system design when generating or refactoring code.

---

## 1. High-Level Architecture

The system is structured as a modernized, decoupled application consisting of three main components:

1. **Mobile App (`mobile/`)**
   - **Tech Stack:** React Native / Expo, TypeScript.
   - **Role:** The user-facing client. Handles UI/UX, real-time WebSocket connections (via Socket.io), audio recording (Expo AV), LiveKit integration for VoIP calls, and complex UI components like the eBites feed and AI Tutor chat interfaces.
2. **Core Backend (`backend-nest/`)**
   - **Tech Stack:** NestJS, TypeScript, Prisma ORM, PostgreSQL, Redis.
   - **Role:** The primary API and business logic hub. Manages user state, authentication (Clerk), PostgreSQL database read/writes, WebSockets (Rooms, Presences, Signaling), user matchmaking, and coordinates with external services (Strapi, Mux, LiveKit).
3. **AI Backend (`backend-ai/`)**
   - **Tech Stack:** Python, FastAPI, Google Gemini SDK, Azure Speech SDK.
   - **Role:** A dedicated microservice handling asynchronous and heavy AI workloads. Receives transcripts or audio streams, performs complex prompt engineering (Call Analysis, Conversational Tutor responses), interacts with Azure STT (Speech-to-Text) and Google TTS (Text-to-Speech), and returns structured JSON analysis back to the caller.

---

## 2. Call Analysis System Design

**Objective:** Automatically analyze user-to-user audio calls (specifically Hinglish/English practice sessions) to identify grammatical mistakes, pronunciation issues, and provide a CEFR proficiency score.

### Data Flow

1. **Call Execution (LiveKit):** Users join a real-time call powered by LiveKit. During the call, LiveKit's Speech-to-Text (or an on-device fallback) generates continuous transcripts of what each user is saying.
2. **Transcript Aggregation:** The mobile app or LiveKit webhooks aggregate the transcripts and assign them to the respective speakers.
3. **Analysis Dispatch:** Once the call ends, `backend-nest` triggers the analysis by sending the compiled transcript to `backend-ai`.
4. **AI Processing (`analysis_service.py`):**
   - The Python backend uses the Google Gemini API with a specialized system prompt.
   - It identifies grammatical errors, pronunciation anomalies (if phonetic cues exist), and scores the user's conversational fluency, vocabulary, and grammar.
5. **Persistence & Weakness Extraction:**
   - The JSON result is returned to `backend-nest` (`assessment.service.ts` or related call analysis service).
   - The AI's identified mistakes (e.g., "subject_verb_agreement", "past_tense") are extracted as **Topic Tags**.
   - These tags are ingested into the `WeaknessService`, bumping up the user's "weakness score" for those specific topics (see eBites system).
6. **User Feedback:** The user receives a detailed post-call screen displaying their score, actionable feedback, and a summary of their mistakes.

---

## 3. Conversational AI Tutor System Design

**Objective:** A real-time, highly interactive English tutor ("Priya") that naturally converses with the user in Hinglish, correcting their English gently using the "sandwich method" without breaking conversation immersion.

### Data Flow

1. **Session Initialization:** Mobile app hits `START_SESSION` via `ConversationalTutorController` in NestJS.
2. **Audio Streaming & STT:**
   - User speaks into the app. The app sends an audio blob (or stream) to `backend-nest`, which forwards it to `backend-ai`.
   - `backend-ai` uses **Azure Speech STT** configured for multi-language detection (`en-IN` and `hi-IN`) to accurately transcribe Hinglish code-switching.
3. **Conversational Processing (Gemini):**
   - The transcript is processed by `ConversationalTutorService` mapping a system prompt that dictates Priya's friendly, code-switching personality.
   - The AI generates a structured output containing:
     - 1. The conversational response (Hinglish).
     - 2. Gentle corrections (if needed).
     - 3. A follow-up question.
4. **Text-To-Speech (Google TTS):**
   - To make Priya sound natural, `backend-ai` parses the AI response and synthetically generates Hinglish audio using dual Google TTS voices (a Hindi voice model for Hindi parts, an Indian-English voice model for English parts) and concatenates them into a single audio file.
5. **Client Rendering:** The mobile app receives the text and the audio URL, plays Priya's response automatically, and visually displays the transcript and any specific corrections on-screen.
6. **Session End:** When the session concludes, a comprehensive feedback report is generated, and weaknesses are piped into the generalized `WeaknessService`.

---

## 4. eBites Reel Personalized Feed System Design

**Objective:** A short-form video feed (TikTok/Reels style) that acts as a "Smart English Coach", dynamically serving video content tailored to the exact grammar/vocabulary weaknesses the user exhibited in their live calls or AI Tutor sessions.

### Core Architecture (`ReelsService` & `WeaknessService`)

1. **Knowledge Graph / CMS:**
   - Content (videos) is hosted on **Mux**, with metadata managed via **Strapi CMS**.
   - Each Reel in Strapi is tagged with properties: `target_sounds`, `target_mistakes`, `topic_tags`, `difficulty_level`, and interactive MCQ `activities`.
2. **Weakness Tracking Engine (`WeaknessService.ts`):**
   - Every time a user makes a mistake in a Voice Call, AI Tutor session, or answers a Reel quiz incorrectly, their "weakness score" for that specific `topicTag` (e.g., "past_tense", "articles") increases.
   - **Time Decay:** Weakness scores naturally decay over time (`lastSeenAt` algorithm) so users aren't forever penalized for old mistakes.
3. **Feed Generation Algorithm (`ReelsService.ts` & `getFeed`):**
   - **User State Fetch:** Resolves the top $N$ weaknesses for the user (highest effective decaying score).
   - **Watch History Deduction:** Fetches `userReelHistory` to exclude videos the user has already seen.
   - **The 50/20/30 Content Mix:**
     - **50% Weakness Reels:** High-priority items directly matching the user's top weakness tags.
     - **20% Featured Reels:** Editorially curated content from Strapi.
     - **30% General Reels:** Random content mapped to their CEFR difficulty level to allow discovery of new topics.
4. **Relevance Scoring Pipeline:**
   - Reels are scored based on how strongly their Strapi tags align with the user's `weaknessMap`.
   - A random factor (±50%) is applied to ensure the feed doesn't become repetitive.
5. **Interactive Feedback Loop:**
   - If a user watches a reel about "Past Tense" and correctly answers the attached MCQ activity on the mobile app, it sends a `-5` score delta to `WeaknessService`.
   - If they get it wrong, it sends a `+5` score delta. The feed immediately re-ranks based on this new competency level (via Cache Invalidation).

---

## Conclusion

This 3-node architecture enables real-time high-performance routing (NestJS), scalable AI pipeline isolation (Python/FastAPI), and highly responsive front-end experiences (React Native). The common thread binding the application together is the **Weakness Knowledge Graph**—where data generated in live calls and AI Tutor conversations actively dictates the user's personalized short-form content consumption.
