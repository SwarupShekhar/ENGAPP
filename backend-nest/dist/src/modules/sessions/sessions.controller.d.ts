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
    getAnalysis(sessionId: string, req: any): Promise<{
        participants: ({
            user: {
                level: string;
                id: string;
                clerkId: string;
                fname: string;
                lname: string;
                gender: string | null;
                hobbies: string[];
                nativeLang: string;
                overallLevel: string | null;
                talkStyle: import(".prisma/client").$Enums.TalkStyle | null;
                levelUpdatedAt: Date | null;
                createdAt: Date;
                updatedAt: Date;
            };
        } & {
            id: string;
            userId: string;
            audioUrl: string | null;
            speakingTime: number;
            turnsTaken: number;
            lastHeartbeat: Date;
            sessionId: string;
        })[];
        analyses: ({
            mistakes: {
                id: string;
                createdAt: Date;
                type: string;
                cefrLevel: string | null;
                original: string;
                severity: string;
                segmentId: string;
                corrected: string;
                rule: string | null;
                explanation: string;
                timestamp: number;
                reviewed: boolean;
                masteryScore: number | null;
                analysisId: string;
            }[];
            pronunciationIssues: {
                id: string;
                createdAt: Date;
                confidence: number | null;
                severity: string;
                segmentId: string | null;
                analysisId: string;
                word: string;
                phoneticExpected: string | null;
                phoneticActual: string | null;
                issueType: string | null;
                suggestion: string | null;
                audioStart: number | null;
                audioEnd: number | null;
            }[];
        } & {
            id: string;
            createdAt: Date;
            sessionId: string;
            participantId: string;
            rawData: import("@prisma/client/runtime/client").JsonValue;
            cefrLevel: string | null;
            scores: import("@prisma/client/runtime/client").JsonValue;
        })[];
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
    end(sessionId: string, data: {
        actualDuration: number;
        userEndedEarly: boolean;
        audioUrls: Record<string, string>;
    }): Promise<{
        status: string;
        sessionId: string;
    }>;
}
