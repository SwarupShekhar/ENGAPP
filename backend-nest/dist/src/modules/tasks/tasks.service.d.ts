import { PrismaService } from '../../database/prisma/prisma.service';
export declare class TasksService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    createTasksFromMistakes(mistakesByCategory: any, userId: string, sessionId: string): Promise<{
        status: string;
    }>;
    getDailyTasks(userId: string): Promise<({
        mistakes: ({
            mistake: {
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
            };
        } & {
            taskId: string;
            mistakeId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        status: string;
        type: string;
        userId: string;
        completedAt: Date | null;
        sessionId: string | null;
        score: number | null;
        title: string;
        content: import("@prisma/client/runtime/client").JsonValue;
        estimatedMinutes: number;
        dueDate: Date;
    })[]>;
    completeTask(taskId: string, score: number): Promise<{
        id: string;
        createdAt: Date;
        status: string;
        type: string;
        userId: string;
        completedAt: Date | null;
        sessionId: string | null;
        score: number | null;
        title: string;
        content: import("@prisma/client/runtime/client").JsonValue;
        estimatedMinutes: number;
        dueDate: Date;
    }>;
}
