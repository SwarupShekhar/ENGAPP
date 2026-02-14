import { client } from './client';

export interface UserStats {
    level: string;
    nextLevel: string;
    feedbackScore: number;
    fluencyScore: number;
    vocabScore: number;
    grammarScore: number;
    pronunciationScore: number;
    streak: number;
    sessionsThisWeek: number;
    sessionGoal: number;
    totalSessions: number;
    mistakeCount: number;
}

export interface AssessmentHistoryItem {
    id: string;
    date: string;
    duration: number;
    overallScore: number;
    cefrLevel: string;
    partnerName: string;
    topic: string;
    status: string;
}

export const userApi = {
    getStats: async (): Promise<UserStats> => {
        const response = await client.get('/users/me/stats');
        return response.data;
    },

    getHistory: async (): Promise<AssessmentHistoryItem[]> => {
        const response = await client.get('/users/me/history');
        return response.data;
    }
};
