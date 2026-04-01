export type VoiceLoopState =
  | "IDLE"
  | "LISTENING"
  | "PROCESSING"
  | "SPEAKING"
  | "ENDED";

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
