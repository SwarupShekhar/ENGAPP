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
  word: string;           // legacy: stores the spoken word
  spoken?: string;        // what user actually said (e.g. "pepul")
  correct?: string;       // correct pronunciation (e.g. "people")
  ruleCategory?: string;  // error category (e.g. "th_to_d")
  reelId?: string;        // eBites reel ID for this error
  phoneticExpected?: string;
  phoneticActual?: string;
  issueType?: string;     // legacy alias for ruleCategory
  severity: string;
  suggestion?: string;
  confidence?: number;
}

/**
 * Extract the correct (target) word and spoken form from a PronunciationIssue row.
 * Prefers new `spoken`/`correct`/`ruleCategory` fields; falls back to legacy parsing.
 */
export function parsePronunciationIssue(issue: SessionPronunciationIssue): {
  spokenWord: string;
  correctWord: string;
  categoryLabel: string;
} {
  // New pipeline: direct fields available — use them
  if (issue.spoken && issue.correct) {
    const ruleCategory = issue.ruleCategory ?? issue.issueType ?? "";
    return {
      spokenWord: issue.spoken,
      correctWord: issue.correct,
      categoryLabel: _categoryLabel(ruleCategory),
    };
  }

  // Legacy fallback: parse from `word` field + suggestion text
  const raw = issue.word ?? "";
  const bracketMatch = raw.match(/^\[mispronounced:\s*(.+)\]$/i);

  let correctFromSuggestion: string | null = null;
  if (issue.suggestion) {
    const pronouncingMatch = issue.suggestion.match(
      /Practice pronouncing "(.+?)" more clearly/,
    );
    if (pronouncingMatch) {
      correctFromSuggestion = pronouncingMatch[1];
    }
    if (!correctFromSuggestion) {
      const egPairMatch = issue.suggestion.match(/e\.g\.\s*"([^"]+)"\s*vs\s*"([^"]+)"/i);
      const genericPairMatch = !egPairMatch
        ? issue.suggestion.match(/"([^"]+)"\s*vs\s*"([^"]+)"/i)
        : null;
      const ex1 = egPairMatch?.[1] ?? genericPairMatch?.[1] ?? null;
      const ex2 = egPairMatch?.[2] ?? genericPairMatch?.[2] ?? null;
      if (ex1 && ex2) {
        const isCorrectSecond = (issue.issueType ?? "").trim() === "w_to_v";
        correctFromSuggestion = isCorrectSecond ? ex2 : ex1;
      }
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

  const ruleCategory = issue.ruleCategory ?? issue.issueType ?? "";
  return { spokenWord, correctWord, categoryLabel: _categoryLabel(ruleCategory) };
}

function _categoryLabel(ruleCategory: string): string {
  const categoryLabels: Record<string, string> = {
    w_to_v: '"W" vs "V"',
    v_to_w_reversal: '"V" vs "W"',
    th_to_t: '"TH" vs "T"',
    th_to_d: '"TH" vs "D"',
    zh_to_j: '"ZH" vs "J"',
    z_to_j: '"Z" vs "J"',
    h_dropping: 'Silent "H"',
    r_rolling: "R rolling",
    ae_to_e: "Vowel /æ/ vs /e/",
    i_to_ee: 'Short "I" vs long "EE"',
    o_to_aa: "Vowel /ɒ/ vs /ɑː/",
    general_mispronunciation: "Mispronunciation",
    phoneme_substitution: "Phoneme substitution",
    syllabic_lengthening: "Vowel lengthening",
    schwa_addition: "Schwa addition",
    schwa_reduction: "Schwa reduction",
    schwa_prothesis: "Vowel prothesis",
  };
  return categoryLabels[ruleCategory] ?? (ruleCategory || "Pronunciation").replace(/_/g, " ");
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
