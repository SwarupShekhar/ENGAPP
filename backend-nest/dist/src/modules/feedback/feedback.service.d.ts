import { PrismaService } from '../../database/prisma/prisma.service';
export declare class FeedbackService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getFeedback(sessionId: string, userId: string): Promise<{
        status: string;
        sessionId: string;
        message: string;
        session?: undefined;
        yourStats?: undefined;
        transcript?: undefined;
        mistakes?: undefined;
        generatedTasks?: undefined;
    } | {
        status: string;
        session: {
            id: string;
            date: Date;
            duration: number;
            partner: {
                id: string;
                name: string;
                level: string;
            };
            topic: string;
        };
        yourStats: {
            speakingTime: number;
            turnsTaken: number;
            avgResponseTime: number;
            scores: import("@prisma/client/runtime/client").JsonValue;
        };
        transcript: {
            raw: any;
            interleaved: any;
        };
        mistakes: {
            byCategory: {
                grammar: number;
                pronunciation: number;
                vocabulary: number;
            };
            items: {
                id: string;
                type: string;
                severity: string;
                original: string;
                corrected: string;
                explanation: string;
                timestamp: number;
                segmentId: string;
            }[];
            pronunciationItems: {
                id: string;
                word: string;
                issue: string;
                suggestion: string;
                timestamp: number;
                confidence: number;
            }[];
        };
        generatedTasks: {
            id: string;
            type: string;
            title: string;
            estimatedMinutes: number;
            dueDate: Date;
        }[];
        sessionId?: undefined;
        message?: undefined;
    }>;
    private parseInterleavedTranscript;
}
