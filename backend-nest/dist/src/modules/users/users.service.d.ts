import { PrismaService } from '../../database/prisma/prisma.service';
export declare class UsersService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getUserStats(userId: string): Promise<{
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
    getUserHistory(userId: string): Promise<{
        id: string;
        date: Date;
        duration: number;
        overallScore: number;
        cefrLevel: string;
        partnerName: string;
        topic: string;
        status: import(".prisma/client").$Enums.AssessmentStatus;
    }[]>;
    private mapCEFRToScore;
    private getNextLevel;
    private calculateStreak;
}
