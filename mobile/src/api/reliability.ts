import { client } from './client';

export interface UserReliability {
    reliabilityScore: number;
    tier: string;
    totalSessions: number;
    completedSessions: number;
    earlyExits: number;
    noShows: number;
    reportsReceived: number;
}

export const reliabilityApi = {
    getUserReliability: async (userId: string): Promise<UserReliability> => {
        const response = await client.get(`/reliability/${userId}`);
        return response.data;
    }
};
