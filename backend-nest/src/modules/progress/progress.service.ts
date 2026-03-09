import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  async getDetailedMetrics(userId: string) {
    try {
      // 1. Get most recent completed sessions of both types
      const [lastAssessment, lastConversation] = await Promise.all([
        this.prisma.assessmentSession
          .findFirst({
            where: { userId, status: 'COMPLETED' },
            orderBy: { completedAt: 'desc' },
          })
          .catch(() => null),
        this.prisma.conversationSession
          .findFirst({
            where: {
              participants: { some: { userId } },
              status: 'COMPLETED',
              summaryJson: { not: null },
            },
            orderBy: { startedAt: 'desc' },
          })
          .catch(() => null),
      ]);

      if (!lastAssessment && !lastConversation) {
        return this.getEmptyMetrics();
      }

      // Determine which one is "current" (the most recent)
      const lastAssessmentTime = lastAssessment?.completedAt
        ? new Date(lastAssessment.completedAt).getTime()
        : 0;
      const lastConversationTime = lastConversation?.startedAt
        ? new Date(lastConversation.startedAt).getTime()
        : 0;

      const currentIsAssessment = lastAssessmentTime >= lastConversationTime;
      const currentSession = currentIsAssessment
        ? lastAssessment
        : lastConversation;

      // 2. Get previous session for delta calculation
      let previousSession: any = null;
      try {
        if (currentIsAssessment && currentSession) {
          previousSession = await this.prisma.assessmentSession.findFirst({
            where: {
              userId,
              status: 'COMPLETED',
              completedAt: { lt: (currentSession as any).completedAt },
            },
            orderBy: { completedAt: 'desc' },
          });
          const interConversation =
            await this.prisma.conversationSession.findFirst({
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
            });
          if (interConversation) previousSession = interConversation;
        } else if (currentSession) {
          previousSession = await this.prisma.conversationSession.findFirst({
            where: {
              participants: { some: { userId } },
              status: 'COMPLETED',
              summaryJson: { not: null },
              startedAt: { lt: (currentSession as any).startedAt },
            },
            orderBy: { startedAt: 'desc' },
          });
          const interAssessment = await this.prisma.assessmentSession.findFirst(
            {
              where: {
                userId,
                status: 'COMPLETED',
                completedAt: {
                  lt: (currentSession as any).startedAt,
                  gt: previousSession?.startedAt || 0,
                },
              },
              orderBy: { completedAt: 'desc' },
            },
          );
          if (interAssessment) previousSession = interAssessment;
        }
      } catch (err) {
        console.warn('Error fetching previous session:', err);
      }

      const currentScores = this.extractScores(currentSession);
      const previousScores = this.extractScores(previousSession);

      // 3. Calculate deltas (ensure numbers)
      const deltas = {
        pronunciation:
          (Number(currentScores.pronunciation) || 0) -
          (Number(previousScores.pronunciation) || 0),
        fluency:
          (Number(currentScores.fluency) || 0) -
          (Number(previousScores.fluency) || 0),
        grammar:
          (Number(currentScores.grammar) || 0) -
          (Number(previousScores.grammar) || 0),
        vocabulary:
          (Number(currentScores.vocabulary) || 0) -
          (Number(previousScores.vocabulary) || 0),
        comprehension:
          (Number(currentScores.comprehension) || 0) -
          (Number(previousScores.comprehension) || 0),
        overallScore:
          (Number(currentScores.overallScore) || 0) -
          (Number(previousScores.overallScore) || 0),
      };

      // 4. Get weekly activity (last 7 days)
      const weeklyActivity = await this.getWeeklyActivity(userId).catch(() => [
        0, 0, 0, 0, 0, 0, 0,
      ]);

      // 5. Get weaknesses
      let weaknesses: any[] = [];
      try {
        if (currentIsAssessment && currentSession) {
          let weaknessMap = (currentSession as any).weaknessMap;
          if (typeof weaknessMap === 'string') {
            try {
              weaknessMap = JSON.parse(weaknessMap);
            } catch (_) {
              weaknessMap = {};
            }
          }
          weaknessMap = weaknessMap || {};
          weaknesses = Object.entries(weaknessMap).map(
            ([skill, details]: [string, any]) => ({
              skill,
              severity: details?.severity || 'MEDIUM',
              recommendation:
                details?.recommendation || `Practice more ${skill} exercises`,
            }),
          );
        } else if (currentSession) {
          let summary = (currentSession as any).summaryJson;
          if (typeof summary === 'string') {
            try {
              summary = JSON.parse(summary);
            } catch (_) {
              summary = {};
            }
          }
          const dominantErrors = summary?.dominant_pronunciation_errors || [];
          weaknesses = dominantErrors.map((error: string) => ({
            skill: 'Pronunciation',
            severity: 'MEDIUM',
            recommendation: `Focus on ${error.replace(/_/g, ' ')} in your next call`,
          }));
        }
      } catch (err) {
        console.warn('Error extracting weaknesses:', err);
      }

      // 6. Get streak and total sessions
      const [reliability, profile] = await Promise.all([
        this.prisma.userReliability
          .findUnique({ where: { userId } })
          .catch(() => null),
        this.prisma.profile.findUnique({ where: { userId } }).catch(() => null),
      ]);

      return {
        current: currentScores,
        deltas,
        weeklyActivity,
        weaknesses: weaknesses.slice(0, 3),
        streak: profile?.streak || 0,
        totalSessions: reliability?.totalSessions || 0,
      };
    } catch (e) {
      console.error('FATAL ERROR in getDetailedMetrics:', e);
      return this.getEmptyMetrics();
    }
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

    // Defensive check if it's an assessment
    const isAssessment =
      'skillBreakdown' in session || 'overallLevel' in session;

    if (isAssessment) {
      let breakdown = session.skillBreakdown || {};
      if (typeof breakdown === 'string') {
        try {
          breakdown = JSON.parse(breakdown);
        } catch (_) {
          breakdown = {};
        }
      }
      const flattened = this.flattenSkills(breakdown);
      return {
        ...flattened,
        overallScore: Math.round(Number(session.overallScore) || 0),
        cefrLevel: session.overallLevel || 'A1',
        comprehension: Math.round(Number(flattened.comprehension) || 0),
      };
    } else {
      let summary = session.summaryJson || {};
      if (typeof summary === 'string') {
        try {
          summary = JSON.parse(summary);
        } catch (_) {
          summary = {};
        }
      }
      return {
        pronunciation: Math.round(Number(summary.pronunciation_score) || 0),
        fluency: Math.round(Number(summary.fluency_score) || 0),
        grammar: Math.round(Number(summary.grammar_score) || 0),
        vocabulary: Math.round(Number(summary.vocabulary_score) || 0),
        comprehension: Math.round(Number(summary.overall_score) || 0),
        overallScore: Math.round(Number(summary.overall_score) || 0),
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
