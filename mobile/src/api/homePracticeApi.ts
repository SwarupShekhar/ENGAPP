import { client } from './client';

export interface DailyPracticeStatus {
  date: string;
  phrase: { done: boolean; completedAt?: string; bestScore?: number };
  word: { done: boolean; completedAt?: string; bestScore?: number };
}

export interface AssessResult {
  pass: boolean;
  errored: boolean;
  overallAccuracy: number;
  focusWords: Array<{ word: string; accuracy: number; pass: boolean }>;
  correctStreak: number;
  streakTarget: number;
  doneForToday: boolean;
  message: string;
  prosody?: { fluency: number | null; prosody: number | null };
}

export interface CallCoachingSummary {
  hintsShown: number;
  phrasesUsed: number;
  phrasesAttempted: string[];
  message: string | null;
}

export interface PreloadedHint {
  id: string;
  taskId: string | null;
  text: string;
  trigger: string;
  watchPhrase: string;
  markField: string | null;
}

export const inCallCoachingApi = {
  getSummary: async (userId: string, sessionId: string): Promise<CallCoachingSummary | null> => {
    try {
      const res = await client.get(`/internal/coaching-context/${userId}/${sessionId}/summary`);
      return res.data;
    } catch {
      return null;
    }
  },

  getHintsPreload: async (userId: string, sessionId: string): Promise<PreloadedHint[]> => {
    try {
      const res = await client.get(`/internal/coaching-context/${userId}/${sessionId}/hints-preload`);
      return res.data ?? [];
    } catch {
      return [];
    }
  },

  scanTranscript: async (userId: string, sessionId: string, segments: string[]): Promise<void> => {
    try {
      await client.post(`/internal/coaching-context/${userId}/${sessionId}/scan-transcript`, { segments });
    } catch {
      // Non-critical — SR credit is best-effort
    }
  },
};

export const homePracticeApi = {
  getStatus: async (): Promise<DailyPracticeStatus> => {
    const res = await client.get('/home/practice/status');
    return res.data;
  },

  assess: async (formData: FormData): Promise<AssessResult> => {
    const res = await client.post('/home/practice/assess', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 45000,
    });
    return res.data;
  },
};
