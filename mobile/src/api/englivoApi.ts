/**
 * englivoApi.ts — Englivo tab API (human tutor, quota, booking).
 *
 * Base URL: englivoClient → https://englivo.com in production.
 * Do NOT use client.ts (Nest) here — see docs/internal-qa-checklist.md.
 *
 * Shared Clerk JWT with EngR; Bridge API holds cross-app CEFR/streak.
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

/** GET /api/me — Englivo user profile (credits, plan, CEFR, etc.) on englivo.com */
export const getEnglivoMe = () =>
  client.get("/api/me").then((r) => r.data).catch((err) => {
    if (__DEV__ && err?.response?.status === 404) {
      // Dev-only stub when not hitting englivo.com (e.g. wrong override URL).
      console.warn(
        "[Englivo API] GET /api/me 404 — use https://englivo.com or set APP_ENGLIVO_API_URL",
      );
      return {
        clerkId: "",
        plan: "FREE",
        status: "ACTIVE",
        quota: {
          weeklyLimitSeconds: null,
          usedSeconds: 0,
          rolledOverSeconds: 0,
          remainingSeconds: null,
          weekStartDate: new Date().toISOString(),
        },
        aiCredits: { granted: 0, used: 0, remaining: 0 },
        organization: null,
      };
    }
    throw err;
  });

// ─── Sessions ─────────────────────────────────────────────────────────────────

/** GET /api/sessions — user's existing bookings */
export const getEnglivoSessions = () =>
  client.get("/api/sessions").then((r) => r.data);

/** GET /api/sessions/upcoming — next booked tutor session (englivo.com) */
export const getEnglivoUpcomingSession = async () => {
  const r = await client.get("/api/sessions/upcoming");
  const data = r.data;
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
};

/** GET /api/sessions/upcoming — all upcoming bookings */
export const getEnglivoUpcomingSessions = async (): Promise<unknown[]> => {
  const r = await client.get("/api/sessions/upcoming");
  const data = r.data;
  if (Array.isArray(data)) return data;
  return data ? [data] : [];
};

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
 * GET /api/livekit/token?mode=human&category — provision an instant tutor room.
 * Backend checks quota, creates a category room, returns token + freeMinutesRemaining.
 */
export const getInstantTutorToken = (
  category: "basics" | "general" | "business" = "general",
): Promise<LiveSessionToken> =>
  client
    .get<LiveSessionToken>("/api/livekit/token", {
      params: { mode: "human", category },
    })
    .then((r) => r.data);

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

export interface ReportPayload {
  transcript: string;
  duration: number;
  words: number;
  sessionId?: string;
}

export interface ReportResult {
  report?: any;
  [key: string]: any;
}

export const generateReport = (payload: ReportPayload): Promise<ReportResult> =>
  client.post<ReportResult>('/api/ai-tutor/report', payload).then((r) => r.data);
