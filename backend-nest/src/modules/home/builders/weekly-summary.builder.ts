import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { BrainService } from '../../brain/brain.service';

@Injectable()
export class WeeklySummaryBuilder {
  private readonly logger = new Logger(WeeklySummaryBuilder.name);

  constructor(
    private prisma: PrismaService,
    private brain: BrainService,
  ) {}

  async build(userId: string) {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);

    // 1. Fetch recent sessions with analysis
    const sessions = await this.prisma.sessionParticipant.findMany({
      where: {
        userId,
        session: {
          startedAt: { gte: sevenDaysAgo },
          status: 'COMPLETED',
        },
      },
      include: {
        analysis: true,
        session: true,
      },
    });

    if (sessions.length < 2) {
      return null; // Don't show summary for users with very low activity
    }

    // 2. Aggregate stats
    let totalScore = 0;
    let count = 0;
    const skillScores = {
      fluency: 0,
      grammar: 0,
      vocabulary: 0,
      pronunciation: 0,
    };

    sessions.forEach((s) => {
      const analysis = s.analysis as any;
      if (analysis && analysis.scores) {
        const scores = analysis.scores;
        skillScores.fluency += scores.fluency || 0;
        skillScores.grammar += scores.grammar || 0;
        skillScores.vocabulary += scores.vocabulary || 0;
        skillScores.pronunciation += scores.pronunciation || 0;
        totalScore += scores.overall || 0;
        count++;
      }
    });

    if (count === 0) return null;

    const avgOverall = Math.round(totalScore / count);
    const avgSkills = {
      fluency: Math.round(skillScores.fluency / count),
      grammar: Math.round(skillScores.grammar / count),
      vocabulary: Math.round(skillScores.vocabulary / count),
      pronunciation: Math.round(skillScores.pronunciation / count),
    };

    // 3. Identify strength and weakness
    const sorted = Object.entries(avgSkills).sort((a, b) => b[1] - a[1]);
    const strength = sorted[0][0];
    const weakness = sorted[sorted.length - 1][0];

    // 4. Calculate improvement (delta from first session of the week to last)
    const sortedSessions = [...sessions].sort(
      (a, b) => a.session.startedAt.getTime() - b.session.startedAt.getTime(),
    );
    const firstAnalysis = sortedSessions[0].analysis as any;
    const lastAnalysis = sortedSessions[sortedSessions.length - 1]
      .analysis as any;

    const firstScore = firstAnalysis?.scores?.overall || avgOverall;
    const lastScore = lastAnalysis?.scores?.overall || avgOverall;
    const improvement = lastScore - firstScore;

    // 5. Generate AI Summary
    const summaryText = await this.brain.generateWeeklySummary(userId, {
      sessions: sessions.length,
      avgScore: avgOverall,
      strength,
      weakness,
      improvement,
    });

    return {
      type: 'weekly_summary',
      priority: 2,
      data: {
        text: summaryText,
        stats: {
          sessions: sessions.length,
          avgScore: avgOverall,
          strength,
          weakness,
          improvement,
        },
        highlights: [
          `🔥 ${sessions.length} sessions completed`,
          `✨ Strongest in ${strength}`,
          `🎯 Goal: Improve ${weakness}`,
        ],
      },
    };
  }
}
