import { UsersService } from './users.service';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    getStats(req: any): Promise<{
        level: string;
        nextLevel: string;
        feedbackScore: number;
        fluencyScore: number;
        vocabScore: number;
        grammarScore: number;
        pronunciationScore: number;
        streak: number;
        sessionsThisWeek: number;
        sessionGoal: number;
        totalSessions: number;
        mistakeCount: number;
    }>;
    getHistory(req: any): Promise<{
        id: string;
        date: Date;
        duration: number;
        overallScore: number;
        cefrLevel: string;
        partnerName: string;
        topic: string;
        status: import(".prisma/client").$Enums.AssessmentStatus;
    }[]>;
}
