export type VoiceLoopState =
  | "IDLE"
  | "LISTENING"
  | "PROCESSING"
  | "SPEAKING"
  | "ENDED";

/** Practice (Englivo AI tutor) vs strict examiner / trial mode. */
export type AiTutorMode = "practice" | "challenge";

export interface TranscribeResponse {
  transcript: string;
  confidence?: number;
}

export interface FluencyAnalysis {
  fluencyScore: number;
  grammarErrors: string[];
  pronunciationErrors: string[];
  suggestions: string[];
}

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
  audioBase64?: string;
  timestamp: number;
}

export interface SessionReport {
  sessionId: string;
  durationMinutes: number;
  fluencyScore: number;
  grammarScore: number;
  pronunciationScore: number;
  vocabularyScore: number;
  cefrLevel: string;
  summary: string;
  improvements: string[];
}

/** Chat history entry for POST /api/ai (matches Englivo web contract). */
export type AiTutorHistoryEntry = { role: string; content: string };

/**
 * POST /api/ai — duplex tutor turn.
 * Web sends: transcript, metrics, fluency, firstName, history, systemPromptType, targetLevel.
 */
export type AiTutorChatPayload = {
  /** Latest user utterance (required). */
  transcript: string;
  /** Conversation turns for coach memory / continuity. */
  history?: AiTutorHistoryEntry[];
  firstName?: string;
  fullName?: string;
  metrics?: Record<string, unknown>;
  fluency?: unknown;
  /** e.g. tutor vs examiner persona */
  systemPromptType?: string;
  targetLevel?: string;
  mode?: AiTutorMode;
  /** Monotonic id to avoid stale responses (optional). */
  requestId?: number;
  /** Legacy alias; server may accept either. */
  message?: string;
};

/** JSON body for POST /api/deepgram when not using multipart (web parity). */
export type DeepgramJsonPayload = {
  audio: string;
  mimeType: string;
};

/**
 * POST /api/ai-tutor/report — fluency report + CEFR.
 * Web may expect transcript + duration + sessionId + words; we also send structured messages for compatibility.
 */
export type AiTutorReportPayload = {
  sessionId: string;
  duration: number;
  durationSeconds?: number;
  transcript: string;
  words: number;
  messages?: AiTutorHistoryEntry[];
};

/** POST /api/ai-tutor/save */
export type AiTutorSavePayload = {
  messages: AiTutorHistoryEntry[];
  duration: number;
  durationSeconds?: number;
  report: SessionReport;
};
