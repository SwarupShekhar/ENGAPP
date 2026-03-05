import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { UserStage } from '../services/stage-resolver.service';

@Injectable()
export class SkillsBuilder {
  constructor(private prisma: PrismaService) {}

  async buildSkillsData(userId: string, stage: UserStage) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return null;

    const totalSessions = user.totalSessions || 0;

    // Get current skill scores from latest analysis
    const latestAnalysis = await this.prisma.analysis.findFirst({
      where: { participant: { userId } },
      orderBy: { createdAt: 'desc' },
    });

    const currentScores = (latestAnalysis?.scores as any) || {
      fluency: user.assessmentScore || 50,
      grammar: user.assessmentScore || 50,
      vocabulary: user.assessmentScore || 50,
      pronunciation: user.assessmentScore || 50,
    };

    // Calculate deltas
    let deltas: any = {
      fluency: 0,
      grammar: 0,
      vocabulary: 0,
      pronunciation: 0,
    };
    let deltaLabel = '';

    if (totalSessions === 0) {
      deltaLabel = '';
    } else if (totalSessions >= 1 && totalSessions < 10) {
      // Delta from last session
      const previousAnalysis = await this.prisma.analysis.findFirst({
        where: { participant: { userId } },
        orderBy: { createdAt: 'desc' },
        skip: 1,
      });

      if (previousAnalysis) {
        const prevScores = previousAnalysis.scores as any;
        Object.keys(deltas).forEach((skill) => {
          deltas[skill] =
            (currentScores[skill] || 0) - (prevScores[skill] || 0);
        });
        deltaLabel = 'Since last session';
      }
    } else if (totalSessions >= 10) {
      // Delta from Day 1 assessment
      const initialAssessment = await this.prisma.assessmentSession.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });

      if (initialAssessment && initialAssessment.skillBreakdown) {
        const initScores = initialAssessment.skillBreakdown as any;
        Object.keys(deltas).forEach((skill) => {
          deltas[skill] =
            (currentScores[skill] || 0) - (initScores[skill] || 0);
        });
        deltaLabel = 'Since Day 1';
      }
    }

    // Calculate average
    const skillValues = Object.values(currentScores).filter(
      (v) => typeof v === 'number',
    ) as number[];
    const avgScore =
      skillValues.length > 0
        ? Math.round(
            skillValues.reduce((a, b) => a + b, 0) / skillValues.length,
          )
        : 0;

    const deltaValues = Object.values(deltas).filter(
      (v) => typeof v === 'number',
    ) as number[];
    const avgDelta =
      deltaValues.length > 0
        ? Math.round(
            deltaValues.reduce((a, b) => a + b, 0) / deltaValues.length,
          )
        : 0;

    // Determine hottest skill (biggest gain)
    const hottestSkill = Object.entries(deltas).sort(
      (a, b) => (b[1] as number) - (a[1] as number),
    )[0][0];

    // Mastery flags for C1+ users
    const masteryFlags =
      (user.assessmentScore || 0) >= 80
        ? {
            fluency: (currentScores.fluency || 0) >= 85,
            grammar: (currentScores.grammar || 0) >= 85,
            vocabulary: (currentScores.vocabulary || 0) >= 85,
            pronunciation: (currentScores.pronunciation || 0) >= 85,
          }
        : null;

    // Mini trends for 30+ sessions
    let trends = null;
    if (totalSessions >= 30) {
      trends = await this.calculateSkillTrends(userId);
    }

    return {
      scores: currentScores,
      deltas,
      deltaLabel,
      avgScore,
      avgDelta,
      hottestSkill,
      masteryFlags,
      trends,
    };
  }

  private async calculateSkillTrends(userId: string) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const analyses = await this.prisma.analysis.findMany({
      where: {
        participant: { userId },
        createdAt: { gte: weekAgo },
      },
      orderBy: { createdAt: 'asc' },
    });

    const trends: Record<string, number[]> = {
      fluency: [],
      grammar: [],
      vocabulary: [],
      pronunciation: [],
    };

    analyses.forEach((analysis) => {
      const scores = analysis.scores as any;
      Object.keys(trends).forEach((skill) => {
        trends[skill].push(scores[skill] || 0);
      });
    });

    return trends;
  }
}
