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

export const homePracticeApi = {
  getStatus: async (): Promise<DailyPracticeStatus> => {
    const res = await client.get('/home/practice/status');
    return res.data;
  },

  assess: async (formData: FormData): Promise<AssessResult> => {
    const res = await client.post('/home/practice/assess', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
};
