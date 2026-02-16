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

        // 1. Get latest SCORES from either Assessment OR Conversation
        const latestAssessment = user.assessments[0];
        const latestConversationSession = await this.prisma.conversationSession.findFirst({
            where: {
                participants: { some: { userId } },
                status: 'COMPLETED'
            },
            orderBy: { createdAt: 'desc' },
            include: {
                analyses: {
                    where: { participantId: { in: await this.getParticipantIds(userId) } }, // Helper needed or simplified
                    take: 1
                }
            }
        });

        // Determine which is more recent
        const assessmentDate = latestAssessment?.createdAt || new Date(0);
        const conversationDate = latestConversationSession?.createdAt || new Date(0);
        const isconversationNewer = conversationDate > assessmentDate;

        let feedbackScore = 0;
        let fluencyScore = 0;
        let vocabScore = 0;
        let grammarScore = 0;
        let pronScore = 0;

        if (isconversationNewer && latestConversationSession?.analyses?.[0]?.scores) {
            // Use Conversation Scores
            const scores = latestConversationSession.analyses[0].scores as any;
            fluencyScore = Math.round(scores.fluency || 0);
            vocabScore = Math.round(scores.vocabulary || 0);
            grammarScore = Math.round(scores.grammar || 0);
            pronScore = Math.round(scores.pronunciation || 0);
            feedbackScore = Math.round(scores.overall || 0);
        } else if (latestAssessment) {
            // Use Assessment Scores
            const p2 = latestAssessment.phase2Data as any || {};
            const p3 = latestAssessment.phase3Data as any || {};

            fluencyScore = Math.round(p2.finalFluencyScore || 0);
            pronScore = Math.round(p2.finalPronunciationScore || 0);
            vocabScore = this.mapCEFRToScore(p3.vocabularyCEFR || 'A1');
            grammarScore = Math.round(p3.grammarScore || 0);
            feedbackScore = Math.round((fluencyScore + pronScore + vocabScore + grammarScore) / 4);
        }

        // 2. Calculate Unified Streak
        const streak = await this.calculateUnifiedStreak(userId);

        // 3. Unified Counts
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const [assessmentsThisWeek, conversationsThisWeek] = await Promise.all([
            this.prisma.assessmentSession.count({ where: { userId, createdAt: { gte: oneWeekAgo } } }),
            this.prisma.conversationSession.count({ where: { participants: { some: { userId } }, createdAt: { gte: oneWeekAgo } } })
        ]);

        const [totalAssessments, totalConversations] = await Promise.all([
            this.prisma.assessmentSession.count({ where: { userId } }),
            this.prisma.conversationSession.count({ where: { participants: { some: { userId } } } })
        ]);

        return {
            level: user.level || 'A1',
            nextLevel: this.getNextLevel(user.level || 'A1'), // Level comes from User profile (updated by Assessment)
            feedbackScore, // Most recent activity score
            fluencyScore,
            vocabScore,
            grammarScore,
            pronunciationScore: pronScore,
            streak,
            sessionsThisWeek: assessmentsThisWeek + conversationsThisWeek,
            sessionGoal: 7,
            totalSessions: totalAssessments + totalConversations,
            mistakeCount: 0, // Placeholder
        };
    }

    private async getParticipantIds(userId: string): Promise<string[]> {
        const parts = await this.prisma.sessionParticipant.findMany({
            where: { userId },
            select: { id: true }
        });
        return parts.map(p => p.id);
    }

    private async calculateUnifiedStreak(userId: string): Promise<number> {
        // Fetch dates from both tables
        const [assessments, conversations] = await Promise.all([
            this.prisma.assessmentSession.findMany({
                where: { userId },
                select: { createdAt: true }
            }),
            this.prisma.conversationSession.findMany({
                where: { participants: { some: { userId } } },
                select: { createdAt: true }
            })
        ]);

        const allDates = [
            ...assessments.map(a => a.createdAt),
            ...conversations.map(c => c.createdAt)
        ];

        if (allDates.length === 0) return 0;

        // Sort descending
        allDates.sort((a, b) => b.getTime() - a.getTime());

        // Group by YYYY-MM-DD
        const uniqueDays = [...new Set(allDates.map(d => d.toISOString().split('T')[0]))];
        if (uniqueDays.length === 0) return 0;

        const todayStr = new Date().toISOString().split('T')[0];
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        // If user hasn't practiced today or yesterday, streak is broken
        // But if they practiced today, streak covers today. 
        // If they checked app yesterday but not today, streak might be active depending on definition.
        // Usually: Must have practiced today OR yesterday to keep streak alive.
        if (uniqueDays[0] !== todayStr && uniqueDays[0] !== yesterdayStr) {
            return 0;
        }

        let streak = 0;


        // Re-do specific consecutive check logic
        let currentStreak = 0;
        let checkDate = new Date(); // Start with today
        let checkDateStr = checkDate.toISOString().split('T')[0];

        // If user didn't practice today, check if they practiced yesterday. 
        // If they practiced today, count starts from today.
        // If they practiced yesterday but not today, count starts from yesterday.
        if (!uniqueDays.includes(todayStr)) {
            if (uniqueDays.includes(yesterdayStr)) {
                checkDate = yesterday; // Start counting back from yesterday
            } else {
                return 0; // Streak broken
            }
        }

        // Loop backwards day by day
        while (true) {
            const dateStr = checkDate.toISOString().split('T')[0];
            if (uniqueDays.includes(dateStr)) {
                currentStreak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }

        return currentStreak;
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
