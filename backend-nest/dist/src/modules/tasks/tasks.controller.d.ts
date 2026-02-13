import { TasksService } from './tasks.service';
export declare class TasksController {
    private tasksService;
    constructor(tasksService: TasksService);
    getDailyTasks(req: any): Promise<{
        tasks: ({
            mistakes: ({
                mistake: {
                    id: string;
                    createdAt: Date;
                    type: string;
                    original: string;
                    cefrLevel: string | null;
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
            userId: string;
            status: string;
            completedAt: Date | null;
            type: string;
            sessionId: string | null;
            score: number | null;
            title: string;
            content: import("@prisma/client/runtime/client").JsonValue;
            estimatedMinutes: number;
            dueDate: Date;
        })[];
    }>;
}
