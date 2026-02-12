import { MatchmakingService } from './matchmaking.service';
export declare class MatchmakingController {
    private matchmakingService;
    constructor(matchmakingService: MatchmakingService);
    joinQueue(body: {
        userId: string;
        englishLevel: string;
        topic?: string;
    }): Promise<{
        status: string;
    }>;
    checkMatch(userId: string, level: string): Promise<{
        matched: boolean;
        message: string;
        sessionId?: undefined;
        roomName?: undefined;
        partnerId?: undefined;
    } | {
        matched: boolean;
        sessionId: string;
        roomName: string;
        partnerId: string;
        message?: undefined;
    } | {
        matched: boolean;
        message?: undefined;
        sessionId?: undefined;
        roomName?: undefined;
        partnerId?: undefined;
    }>;
}
