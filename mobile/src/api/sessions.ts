import { client } from "./client";

// ─── Types ─────────────────────────────────────────────────
export interface SessionParticipant {
  id: string;
  userId: string;
  speakingTime: number;
  turnsTaken: number;
  user?: {
    id: string; // internal UUID
    clerkId?: string;
    fname: string;
    lname: string;
  };
}

export interface SessionAnalysis {
  id: string;
  cefrLevel: string;
  scores: {
    grammar: number;
    pronunciation: number;
    fluency: number;
    vocabulary: number;
    overall: number;
    grammar_score?: number;
    pronunciation_score?: number;
    fluency_score?: number;
    vocabulary_score?: number;
    overall_score?: number;
  };
  mistakes: SessionMistake[];
  pronunciationIssues: SessionPronunciationIssue[];
  rawData?: {
    aiFeedback?: string;
    strengths?: string[];
    improvementAreas?: string[];
    accentNotes?: string;
    pronunciationTip?: string;
    azureEvidence?: any;
  };
}

export interface SessionMistake {
  id: string;
  type: string;
  severity: string;
  original: string;
  corrected: string;
  explanation: string;
  rule?: string;
  cefrLevel?: string;
  example?: string;
}

export interface SessionPronunciationIssue {
  id: string;
  word: string;
  phoneticExpected?: string;
  phoneticActual?: string;
  issueType?: string;
  severity: string;
  suggestion?: string;
  confidence?: number;
}

/**
 * Extract the correct (target) word from a PronunciationIssue row.
 * Backend stores `word = err.spoken` (e.g. "een", "[mispronounced: today]")
 * and `suggestion` embeds the correct word in certain patterns.
 */
export function parsePronunciationIssue(issue: SessionPronunciationIssue): {
  spokenWord: string;
  correctWord: string;
  categoryLabel: string;
} {
  const raw = issue.word ?? "";

  // "[mispronounced: today]" → correct = "today", spoken = "today" (we don't have the actual spoken form)
  const bracketMatch = raw.match(/^\[mispronounced:\s*(.+)\]$/i);

  // Try to extract the correct word from the suggestion text
  // Patterns: 'Practice pronouncing "today" more clearly' or 'Practice "w" vs "v"'
  let correctFromSuggestion: string | null = null;
  if (issue.suggestion) {
    const pronouncingMatch = issue.suggestion.match(
      /Practice pronouncing "(.+?)" more clearly/,
    );
    if (pronouncingMatch) {
      correctFromSuggestion = pronouncingMatch[1];
    }
  }

  let spokenWord: string;
  let correctWord: string;

  if (bracketMatch) {
    correctWord = bracketMatch[1].trim();
    spokenWord = correctWord;
  } else if (correctFromSuggestion) {
    spokenWord = raw;
    correctWord = correctFromSuggestion;
  } else {
    spokenWord = raw;
    correctWord = raw;
  }

  const categoryLabels: Record<string, string> = {
    w_to_v: '"W" vs "V"',
    v_to_w_reversal: '"V" vs "W"',
    th_to_t: '"TH" vs "T"',
    th_to_d: '"TH" vs "D"',
    zh_to_j: '"ZH" vs "J"',
    z_to_j: '"Z" vs "J"',
    h_dropping: 'Silent "H"',
    r_rolling: "R rolling",
    ae_to_e: "Vowel /ae/ vs /e/",
    i_to_ee: 'Short "I" vs long "EE"',
    o_to_aa: "Vowel /o/ vs /aa/",
    general_mispronunciation: "Mispronunciation",
  };

  const categoryLabel =
    categoryLabels[issue.issueType ?? ""] ??
    (issue.issueType ?? "Pronunciation").replace(/_/g, " ");

  return { spokenWord, correctWord, categoryLabel };
}

/** Session summary with pronunciation-enhanced scoring (from post-call processor). */
export interface SessionSummaryJson {
  transcript?: string;
  pronunciation_flagged?: unknown[];
  cefr_score?: string;
  overall_score?: number;
  grammar_score?: number;
  vocabulary_score?: number;
  fluency_score?: number;
  pronunciation_score?: number;
  pronunciation_cefr_cap?: "A2" | "B1" | null;
  pronunciation_cap_reason?: string | null;
  dominant_pronunciation_errors?: string[];
  grammar_errors?: unknown[];
}

export interface ConversationSession {
  id: string;
  topic: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  duration: number | null;
  participants: SessionParticipant[];
  analyses?: SessionAnalysis[];
  /** Per-participant feedback rows (from getSessionAnalysis); used to show "waiting for partner" */
  feedbacks?: { transcript?: unknown; participantId?: string }[];
  feedback?: {
    id: string;
    transcript: string | null;
  };
  summaryJson?: SessionSummaryJson | null;
}

// ─── API ───────────────────────────────────────────────────
export const sessionsApi = {
  /** Get all sessions for the current user */
  listSessions: async (): Promise<ConversationSession[]> => {
    const response = await client.get("/sessions");
    return response.data;
  },

  /** Get detailed analysis for a specific session. Pass retry: true to ask the backend to re-queue analysis when status is ANALYSIS_FAILED. */
  getSessionAnalysis: async (
    sessionId: string,
    options?: { retry?: boolean },
  ): Promise<ConversationSession> => {
    const params = options?.retry ? { retry: "1" } : undefined;
    const response = await client.get(`/sessions/${sessionId}/analysis`, {
      params,
    });
    return response.data;
  },

  /** Start a new practice session */
  startSession: async (topic?: string): Promise<ConversationSession> => {
    const response = await client.post("/sessions/start", { topic });
    return response.data;
  },

  /** End a practice session */
  endSession: async (
    sessionId: string,
    data?: {
      transcript?:
        | string
        | { speaker_id: string; text: string; timestamp: string }[];
      actualDuration?: number;
      userEndedEarly?: boolean;
    },
  ): Promise<void> => {
    await client.post(`/sessions/${sessionId}/end`, data);
  },

  /** Dev/admin: re-run pronunciation processing for an existing session. */
  rerunPronunciation: async (sessionId: string): Promise<any> => {
    const response = await client.post(`/sessions/${sessionId}/pronunciation/rerun`);
    return response.data;
  },
};
