import { client } from './client';

export interface MatchmakingJoinPayload {
    userId: string;
    englishLevel: string;
    topic?: string;
}

export interface MatchmakingStatus {
    matched: boolean;
    sessionId?: string;
    roomName?: string;
    partnerId?: string;
    partnerName?: string;
    message?: string;
}

export const matchmakingApi = {
    join: async (payload: MatchmakingJoinPayload): Promise<{ status: string }> => {
        const response = await client.post('/matchmaking/join', payload);
        return response.data;
    },

    checkStatus: async (userId: string, level: string): Promise<MatchmakingStatus> => {
        const response = await client.get('/matchmaking/status', {
            params: { userId, level }
        });
        return response.data;
    },

    findStructured: async (userId: string, structure: string): Promise<{ matched: boolean; partnerId?: string; sessionId?: string }> => {
        const response = await client.post('/matchmaking/find-structured', { userId, structure });
        return response.data;
    }
};
