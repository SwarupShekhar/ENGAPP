import { client } from './client';

// ─── Types ─────────────────────────────────────────────────
export interface ProgressData {
    currentLevel: string;
    overallScore: number;
    totalSessions: number;
    streak: number;
    skills: {
        grammar: number;
        pronunciation: number;
        fluency: number;
        vocabulary: number;
    };
    recentScores: { date: string; score: number }[];
    commonMistakes: { type: string; count: number }[];
}

// ─── API ───────────────────────────────────────────────────
export const progressApi = {
    /** Get assessment dashboard / progress data */
    getDashboard: async (): Promise<ProgressData> => {
        const response = await client.get('/assessment/dashboard');
        return response.data;
    },
};
