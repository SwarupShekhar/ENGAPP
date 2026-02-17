import { client } from './client';

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
}

export interface SessionPronunciationIssue {
    id: string;
    word: string;
    phoneticExpected?: string;
    phoneticActual?: string;
    issueType?: string;
    severity: string;
    suggestion?: string;
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
    feedback?: {
        id: string;
        transcript: string | null;
    };
}

// ─── API ───────────────────────────────────────────────────
export const sessionsApi = {
    /** Get all sessions for the current user */
    listSessions: async (): Promise<ConversationSession[]> => {
        const response = await client.get('/sessions');
        return response.data;
    },

    /** Get detailed analysis for a specific session */
    getSessionAnalysis: async (sessionId: string): Promise<ConversationSession> => {
        const response = await client.get(`/sessions/${sessionId}/analysis`);
        return response.data;
    },

    /** Start a new practice session */
    startSession: async (topic?: string): Promise<ConversationSession> => {
        const response = await client.post('/sessions/start', { topic });
        return response.data;
    },

    /** End a practice session */
    endSession: async (sessionId: string, data?: { transcript?: string; actualDuration?: number; userEndedEarly?: boolean }): Promise<void> => {
        await client.post(`/sessions/${sessionId}/end`, data);
    },
};
