# EngR App - Architecture Pack

Welcome to the EngR App Architecture Pack. This directory contains detailed documentation about the system's architecture, API contracts, and data schema.

## Contents

- [**System Architecture & API**](SYSTEM-ARCHITECTURE-AND-API.md)
  - Detailed breakdown of the 3-node architecture (Mobile, NestJS Backend, AI Backend).
  - API contracts for the AI microservice.
  - Communication protocols and middleware.
- [**Data Schema & ERD**](DATA-SCHEMA-AND-ERD.md)
  - Database schema overview (PostgreSQL/Prisma).
  - Entity-Relationship Diagram (ERD).
  - Caching and CMS integration details.

## High-Level Ecosystem

The EngR ecosystem is designed as a modernized, decoupled application focusing on real-time English learning through AI-powered call analysis, conversational tutoring, and personalized content delivery.

1.  **Mobile App (`mobile/`)**: React Native/Expo client handling UI, audio recording, and real-time interaction.
2.  **Core Backend (`backend-nest/`)**: NestJS hub for business logic, user management, and service coordination.
3.  **AI Backend (`backend-ai/`)**: Python/FastAPI microservice for heavy AI workloads (Gemini, STT, TTS).

---

For a high-level context report, see the root [`SYSTEM_ARCHITECTURE.md`](../../SYSTEM_ARCHITECTURE.md).
