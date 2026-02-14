import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(private prisma: PrismaService) { }

    async getUserStats(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                assessments: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });

        if (!user) throw new NotFoundException('User not found');

        // Get latest assessment for scores
        const latestAssessment = user.assessments[0];
        let feedbackScore = 0;
        let fluencyScore = 0;
        let vocabScore = 0;
        let grammarScore = 0;
        let pronScore = 0;

        if (latestAssessment) {
            // Extract scores from latest assessment phases
            const p2 = latestAssessment.phase2Data as any || {};
            const p3 = latestAssessment.phase3Data as any || {};

            fluencyScore = Math.round(p2.finalFluencyScore || 0);
            pronScore = Math.round(p2.finalPronunciationScore || 0);
            vocabScore = this.mapCEFRToScore(p3.vocabularyCEFR || 'A1');
            grammarScore = Math.round(p3.grammarScore || 0);

            // Overall score approximate
            feedbackScore = Math.round((fluencyScore + pronScore + vocabScore + grammarScore) / 4);
        }

        // Calculate streak (consecutive days with at least one assessment/session)
        const streak = await this.calculateStreak(userId);

        // Count sessions this week
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const sessionsThisWeek = await this.prisma.assessmentSession.count({
            where: {
                userId,
                createdAt: { gte: oneWeekAgo }
            }
        });

        return {
            level: user.level || 'A1',
            nextLevel: this.getNextLevel(user.level || 'A1'),
            feedbackScore,
            fluencyScore,
            vocabScore,
            grammarScore,
            pronunciationScore: pronScore,
            streak,
            sessionsThisWeek,
            sessionGoal: 7, // Hardcoded daily/weekly goal for now
            totalSessions: await this.prisma.assessmentSession.count({ where: { userId } }),
            mistakeCount: 5, // Placeholder or aggregate from assessments
        };
    }

    async getUserHistory(userId: string) {
        const history = await this.prisma.assessmentSession.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        return history.map(session => {
            const p2 = session.phase2Data as any || {};
            const p3 = session.phase3Data as any || {};

            // Calculate an overall score for the session
            const score = Math.round(
                ((p2.finalFluencyScore || 0) +
                    (p2.finalPronunciationScore || 0) +
                    (p3.grammarScore || 0) +
                    (this.mapCEFRToScore(p3.vocabularyCEFR || 'A1'))) / 4
            );

            return {
                id: session.id,
                date: session.createdAt,
                duration: 600, // Placeholder or calculate diff
                overallScore: score || session.overallScore || 0,
                cefrLevel: session.overallLevel || 'A1',
                partnerName: 'AI Evaluator',
                topic: 'Assessment',
                status: session.status
            };
        });
    }

    private mapCEFRToScore(cefr: string): number {
        const map: Record<string, number> = { A1: 20, A2: 40, B1: 60, B2: 80, C1: 90, C2: 100 };
        return map[cefr] || 20;
    }

    private getNextLevel(current: string): string {
        const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        const idx = levels.indexOf(current);
        return levels[idx + 1] || 'C2';
    }

    private async calculateStreak(userId: string): Promise<number> {
        const sessions = await this.prisma.assessmentSession.findMany({
            where: { userId },
            select: { createdAt: true },
            orderBy: { createdAt: 'desc' }
        });

        if (sessions.length === 0) return 0;

        // Group by YYYY-MM-DD
        const dates = [...new Set(sessions.map(s => s.createdAt.toISOString().split('T')[0]))];

        if (dates.length === 0) return 0;

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // If user hasn't practiced today or yesterday, streak is broken
        if (dates[0] !== todayStr && dates[0] !== yesterdayStr) {
            return 0;
        }

        let streak = 1;
        let currentDate = new Date(dates[0]);

        for (let i = 1; i < dates.length; i++) {
            const previousDate = new Date(currentDate);
            previousDate.setDate(previousDate.getDate() - 1);
            const previousDateStr = previousDate.toISOString().split('T')[0];

            if (dates[i] === previousDateStr) {
                streak++;
                currentDate = previousDate;
            } else {
                break; // Streak broken
            }
        }

        return streak;
    }
}
