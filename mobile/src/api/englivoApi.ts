/**
 * englivoApi.ts — typed API functions for all Core (Englivo) endpoints.
 *
 * Every function here uses `client` from englivoClient, which targets
 * https://englivo.com/api in production and http://<LOCAL_IP>:3000/api in dev.
 *
 * Rules:
 *  - This file is ONLY for Core screens.
 *  - Never import client.ts (EngR / Pulse backend) here.
 *  - Never hardcode clerkId — always pass from useAuth() / useUser().
 */

import { client } from "./englivoClient";

// ─── Booking ──────────────────────────────────────────────────────────────────

export interface BookingPayload {
  topicId: string;
  slotId: string;
  tutorId: string;
}

export interface BookingResult {
  success: boolean;
  bookingId?: string;
  message?: string;
}

// ─── User / Profile ───────────────────────────────────────────────────────────

/** GET /api/me — Englivo user profile (credits, plan, CEFR, etc.) */
export const getEnglivoMe = () =>
  client.get("/api/me").then((r) => r.data);

// ─── Sessions ─────────────────────────────────────────────────────────────────

/** GET /api/sessions — user's existing bookings */
export const getEnglivoSessions = () =>
  client.get("/api/sessions").then((r) => r.data);

/** POST /api/sessions/book — create new booking */
export const bookSession = (payload: BookingPayload): Promise<BookingResult> =>
  client.post<BookingResult>("/api/sessions/book", payload).then((r) => r.data);

/** POST /api/sessions/cancel — cancel a booking */
export const cancelSession = (sessionId: string) =>
  client.post("/api/sessions/cancel", { sessionId }).then((r) => r.data);

export interface LiveSessionToken {
  token: string;
  roomName: string;
  serverUrl?: string;        // LiveKit WSS URL — may be returned by backend
  tutorName?: string;
  sessionId?: string;
  creditsPerMinute?: number;
  freeMinutesRemaining?: number;
}

/** POST /api/sessions/[id]/join — join a booked session → returns LiveKit token */
export const joinBookedSession = (sessionId: string): Promise<LiveSessionToken> =>
  client.post<LiveSessionToken>(`/api/sessions/${sessionId}/join`).then((r) => r.data);

/** Alias used by EnglivoHomeScreenV2's TicketCard join handler */
export const joinSession = joinBookedSession;

/**
 * GET /api/livekit/token — provision an instant tutor room.
 * No mode param = human tutor session.
 * Backend finds an available tutor, creates a room, returns token.
 */
export const getInstantTutorToken = (): Promise<LiveSessionToken> =>
  client.get<LiveSessionToken>("/api/livekit/token").then((r) => r.data);

// ─── AI Tutor ─────────────────────────────────────────────────────────────────

/** GET /api/practice/turn — fetch AI tutor prompt for the next turn */
export const getAiTutorTurn = () =>
  client.get("/api/practice/turn").then((r) => r.data);

/** POST /api/ai — send a message to the AI tutor */
export const sendAiMessage = (payload: any) =>
  client.post("/api/ai", payload).then((r) => r.data);

/** POST /api/ai-tutor/save — save AI session on completion */
export const saveAiSession = (payload: any) =>
  client.post("/api/ai-tutor/save", payload).then((r) => r.data);

/** GET /api/ai-tutor/history — AI session history */
export const getAiTutorHistory = () =>
  client.get("/api/ai-tutor/history").then((r) => r.data);
