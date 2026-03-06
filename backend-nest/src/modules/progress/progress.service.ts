import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  async getDetailedMetrics(userId: string) {
    // 1. Get current completed assessment
    const currentAssessment = await this.prisma.assessmentSession.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
    });

    if (!currentAssessment) {
      return this.getEmptyMetrics();
    }

    // 2. Get previous completed assessment (for delta)
    const previousAssessment = await this.prisma.assessmentSession.findFirst({
      where: {
        userId,
        status: 'COMPLETED',
        completedAt: { lt: currentAssessment.completedAt || new Date() },
      },
      orderBy: { completedAt: 'desc' },
    });

    const currentScoresRaw = (currentAssessment.skillBreakdown as any) || {};
    const previousScoresRaw = (previousAssessment?.skillBreakdown as any) || {};

    const currentScores = this.flattenSkills(currentScoresRaw);
    const previousScores = this.flattenSkills(previousScoresRaw);

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
        (currentAssessment.overallScore || 0) -
        (previousAssessment?.overallScore || 0),
    };

    // 4. Get weekly activity (last 7 days)
    const weeklyActivity = await this.getWeeklyActivity(userId);

    // 5. Get weaknesses from weaknessMap
    const weaknessMap = (currentAssessment.weaknessMap as any) || {};
    const weaknesses = Object.entries(weaknessMap).map(
      ([skill, details]: [string, any]) => ({
        skill,
        severity: details.severity || 'MEDIUM',
        recommendation:
          details.recommendation || `Practice more ${skill} exercises`,
      }),
    );

    // 6. Get streak and total sessions from reliability/profile
    const reliability = await this.prisma.userReliability.findUnique({
      where: { userId },
    });
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    return {
      current: {
        pronunciation: Math.round(currentScores.pronunciation || 0),
        fluency: Math.round(currentScores.fluency || 0),
        grammar: Math.round(currentScores.grammar || 0),
        vocabulary: Math.round(currentScores.vocabulary || 0),
        comprehension: Math.round(currentScores.comprehension || 0),
        overallScore: Math.round(currentAssessment.overallScore || 0),
        cefrLevel: currentAssessment.overallLevel || 'A1',
      },
      deltas,
      weeklyActivity,
      weaknesses: weaknesses.slice(0, 3), // Limit to top 3
      streak: profile?.streak || 0,
      totalSessions: reliability?.totalSessions || 0,
    };
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
