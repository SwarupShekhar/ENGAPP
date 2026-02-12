import { SessionsService } from './sessions.service';
export declare class SessionsController {
    private readonly sessionsService;
    constructor(sessionsService: SessionsService);
    start(data: {
        matchId: string;
        participants: string[];
        topic: string;
        estimatedDuration: number;
    }): Promise<{
        participants: {
            id: string;
            userId: string;
            audioUrl: string | null;
            speakingTime: number;
            turnsTaken: number;
            lastHeartbeat: Date;
            sessionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        topic: string | null;
        status: string;
        startedAt: Date;
        endedAt: Date | null;
        duration: number | null;
    }>;
    heartbeat(sessionId: string, data: {
        userId: string;
    }): Promise<{
        status: string;
    }>;
    end(sessionId: string, data: {
        actualDuration: number;
        userEndedEarly: boolean;
        audioUrls: Record<string, string>;
    }): Promise<{
        status: string;
        sessionId: string;
    }>;
}
