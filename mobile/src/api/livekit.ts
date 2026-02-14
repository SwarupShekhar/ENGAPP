import { client } from './client';

export interface LivekitTokenResponse {
    token: string;
    roomName: string;
}

export const livekitApi = {
    getToken: async (userId: string, sessionId: string): Promise<LivekitTokenResponse> => {
        const response = await client.post('/livekit/token', { userId, sessionId });
        return response.data;
    }
};
