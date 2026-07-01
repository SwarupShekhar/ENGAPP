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

export interface ListenVoicePreference {
    voice: 'Kiki' | 'Jasper';
    chosen: boolean;
}

export interface TestNotificationResult {
    ok: boolean;
    pushConfigured: boolean;
    deviceTokens: number;
    delivered: number;
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

    getListenVoice: async (): Promise<ListenVoicePreference> => {
        const response = await client.get('/users/me/listen-voice');
        return response.data;
    },

    updateListenVoice: async (
        prefs: Partial<ListenVoicePreference>,
    ): Promise<ListenVoicePreference> => {
        const response = await client.patch('/users/me/listen-voice', prefs);
        return response.data;
    },

    sendTestNotification: async (): Promise<TestNotificationResult> => {
        const response = await client.post('/users/me/notifications/test');
        return response.data;
    },
};
