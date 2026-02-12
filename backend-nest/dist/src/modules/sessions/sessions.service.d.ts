import { Queue } from 'bull';
import { PrismaService } from '../../database/prisma/prisma.service';
export declare class SessionsService {
    private prisma;
    private sessionsQueue;
    private readonly logger;
    constructor(prisma: PrismaService, sessionsQueue: Queue);
    startSession(data: {
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
    heartbeat(sessionId: string, userId: string): Promise<{
        status: string;
    }>;
    endSession(sessionId: string, data: {
        actualDuration: number;
        userEndedEarly: boolean;
        audioUrls: Record<string, string>;
    }): Promise<{
        status: string;
        sessionId: string;
    }>;
}
