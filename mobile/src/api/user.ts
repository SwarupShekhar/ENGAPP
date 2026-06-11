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

export interface NotificationPreferences {
    practiceRemindersEnabled: boolean;
}

export const userApi = {
    getStats: async (): Promise<UserStats> => {
        const response = await client.get('/users/me/stats');
        return response.data;
    },

    getHistory: async (): Promise<AssessmentHistoryItem[]> => {
        const response = await client.get('/users/me/history');
        return response.data;
    },

    getCurrentUserId: async (): Promise<string | null> => {
        try {
            const response = await client.get('/auth/me');
            return response.data?.data?.id ?? null;
        } catch {
            return null;
        }
    },

    getNotificationPreferences: async (): Promise<NotificationPreferences> => {
        const response = await client.get('/users/me/notification-preferences');
        return response.data;
    },

    updateNotificationPreferences: async (
        prefs: Partial<NotificationPreferences>,
    ): Promise<NotificationPreferences> => {
        const response = await client.patch(
            '/users/me/notification-preferences',
            prefs,
        );
        return response.data;
    },
};
