import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  async getDetailedMetrics(userId: string) {
    // 1. Get most recent completed sessions of both types
    const [lastAssessment, lastConversation] = await Promise.all([
      this.prisma.assessmentSession.findFirst({
        where: { userId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
      }),
      this.prisma.conversationSession.findFirst({
        where: {
          participants: { some: { userId } },
          status: 'COMPLETED',
          summaryJson: { not: null },
        },
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    if (!lastAssessment && !lastConversation) {
      return this.getEmptyMetrics();
    }

    // Determine which one is "current" (the most recent)
    const currentIsAssessment =
      !lastConversation ||
      (lastAssessment &&
        lastAssessment.completedAt &&
        lastAssessment.completedAt > (lastConversation.startedAt || 0));

    const currentSession = currentIsAssessment
      ? lastAssessment
      : lastConversation;

    // 2. Get previous session for delta calculation
    let previousSession: any = null;
    if (currentIsAssessment) {
      previousSession = await this.prisma.assessmentSession.findFirst({
        where: {
          userId,
          status: 'COMPLETED',
          completedAt: { lt: (currentSession as any).completedAt },
        },
        orderBy: { completedAt: 'desc' },
      });
      // Also check if there's a conversation session between this and previous assessment
      const interConversation = await this.prisma.conversationSession.findFirst(
        {
          where: {
            participants: { some: { userId } },
            status: 'COMPLETED',
            summaryJson: { not: null },
            startedAt: {
              lt: (currentSession as any).completedAt,
              gt: previousSession?.completedAt || 0,
            },
          },
          orderBy: { startedAt: 'desc' },
        },
      );
      if (interConversation) previousSession = interConversation;
    } else {
      previousSession = await this.prisma.conversationSession.findFirst({
        where: {
          participants: { some: { userId } },
          status: 'COMPLETED',
          summaryJson: { not: null },
          startedAt: { lt: (currentSession as any).startedAt },
        },
        orderBy: { startedAt: 'desc' },
      });
      // Also check if there's an assessment session between this and previous conversation
      const interAssessment = await this.prisma.assessmentSession.findFirst({
        where: {
          userId,
          status: 'COMPLETED',
          completedAt: {
            lt: (currentSession as any).startedAt,
            gt: previousSession?.startedAt || 0,
          },
        },
        orderBy: { completedAt: 'desc' },
      });
      if (interAssessment) previousSession = interAssessment;
    }

    const currentScores = this.extractScores(currentSession);
    const previousScores = this.extractScores(previousSession);

    // 3. Calculate deltas
    const deltas = {
      pronunciation:
        (currentScores.pronunciation || 0) -
        (previousScores.pronunciation || 0),
      fluency: (currentScores.fluency || 0) - (previousScores.fluency || 0),
      grammar: (currentScores.grammar || 0) - (previousScores.grammar || 0),
      vocabulary:
        (currentScores.vocabulary || 0) - (previousScores.vocabulary || 0),
      comprehension:
        (currentScores.comprehension || 0) -
        (previousScores.comprehension || 0),
      overallScore:
        (currentScores.overallScore || 0) - (previousScores.overallScore || 0),
    };

    // 4. Get weekly activity (last 7 days)
    const weeklyActivity = await this.getWeeklyActivity(userId);

    // 5. Get weaknesses
    let weaknesses: any[] = [];
    if (currentIsAssessment) {
      const weaknessMap = (currentSession as any).weaknessMap || {};
      weaknesses = Object.entries(weaknessMap).map(
        ([skill, details]: [string, any]) => ({
          skill,
          severity: details.severity || 'MEDIUM',
          recommendation:
            details.recommendation || `Practice more ${skill} exercises`,
        }),
      );
    } else {
      // For conversations, use dominant errors from summary
      const dominantErrors =
        (currentSession as any).summaryJson?.dominant_pronunciation_errors ||
        [];
      weaknesses = dominantErrors.map((error: string) => ({
        skill: 'Pronunciation',
        severity: 'MEDIUM',
        recommendation: `Focus on ${error.replace(/_/g, ' ')} in your next call`,
      }));
    }

    // 6. Get streak and total sessions
    const [reliability, profile] = await Promise.all([
      this.prisma.userReliability.findUnique({ where: { userId } }),
      this.prisma.profile.findUnique({ where: { userId } }),
    ]);

    return {
      current: currentScores,
      deltas,
      weeklyActivity,
      weaknesses: weaknesses.slice(0, 3),
      streak: profile?.streak || 0,
      totalSessions: reliability?.totalSessions || 0,
    };
  }

  private extractScores(session: any) {
    if (!session)
      return {
        pronunciation: 0,
        fluency: 0,
        grammar: 0,
        vocabulary: 0,
        comprehension: 0,
        overallScore: 0,
        cefrLevel: 'A1',
      };

    const isAssessment = 'skillBreakdown' in session;

    if (isAssessment) {
      const breakdown = session.skillBreakdown || {};
      const flattened = this.flattenSkills(breakdown);
      return {
        ...flattened,
        overallScore: Math.round(session.overallScore || 0),
        cefrLevel: session.overallLevel || 'A1',
        comprehension: Math.round(flattened.comprehension || 0),
      };
    } else {
      const summary = session.summaryJson || {};
      return {
        pronunciation: Math.round(summary.pronunciation_score || 0),
        fluency: Math.round(summary.fluency_score || 0),
        grammar: Math.round(summary.grammar_score || 0),
        vocabulary: Math.round(summary.vocabulary_score || 0),
        comprehension: Math.round(summary.overall_score || 0), // Default comprehension to overall for calls
        overallScore: Math.round(summary.overall_score || 0),
        cefrLevel: summary.cefr_score || 'B1',
      };
    }
  }

  private flattenSkills(breakdown: any) {
    if (!breakdown) return {};
    // Extract primary field or use object if it's already a number
    const getScore = (val: any) => {
      if (typeof val === 'number') return val;
      if (typeof val === 'object' && val !== null) {
        return (
          val.phonemeAccuracy ||
          val.speechRate ||
          val.tenseControl ||
          val.lexicalRange ||
          val.score ||
          0
        );
      }
      return 0;
    };

    return {
      pronunciation: getScore(breakdown.pronunciation),
      fluency: getScore(breakdown.fluency),
      grammar: getScore(breakdown.grammar),
      vocabulary: getScore(breakdown.vocabulary),
      comprehension:
        getScore(breakdown.comprehension) || breakdown.overallScore || 0,
    };
  }

  private async getWeeklyActivity(userId: string): Promise<number[]> {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Using SessionParticipant to count active sessions
    const sessions = await this.prisma.sessionParticipant.findMany({
      where: {
        userId,
        session: {
          startedAt: { gte: sevenDaysAgo },
          status: 'COMPLETED',
        },
      },
      include: {
        session: true,
      },
    });

    const activity = Array(7).fill(0);
    sessions.forEach((p) => {
      const dayIndex = Math.floor(
        (p.session.startedAt.getTime() - sevenDaysAgo.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      if (dayIndex >= 0 && dayIndex < 7) {
        activity[dayIndex]++;
      }
    });

    return activity;
  }

  private getEmptyMetrics() {
    return {
      current: {
        pronunciation: 0,
        fluency: 0,
        grammar: 0,
        vocabulary: 0,
        comprehension: 0,
        overallScore: 0,
        cefrLevel: 'A1',
      },
      deltas: {
        pronunciation: 0,
        fluency: 0,
        grammar: 0,
        vocabulary: 0,
        comprehension: 0,
        overallScore: 0,
      },
      weeklyActivity: [0, 0, 0, 0, 0, 0, 0],
      weaknesses: [],
      streak: 0,
      totalSessions: 0,
    };
  }
}
