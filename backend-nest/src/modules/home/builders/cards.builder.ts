import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { UserStage } from '../services/stage-resolver.service';
import { WeeklySummaryBuilder } from './weekly-summary.builder';

@Injectable()
export class CardsBuilder {
  constructor(
    private prisma: PrismaService,
    private weeklySummaryBuilder: WeeklySummaryBuilder,
  ) {}

  async buildContextualCards(userId: string, stage: UserStage) {
    const cards: any[] = [];
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        reliability: true,
      },
    });

    if (!user) return cards;

    // 0. AI Weekly Summary (New Priority)
    const weeklySummary = await this.weeklySummaryBuilder.build(userId);
    if (weeklySummary) {
      cards.push(weeklySummary);
    }

    // 1. Weekly Progress (Active users)
    if (stage >= UserStage.ACTIVE_BEGINNER && user.totalSessions >= 1) {
      const weeklyData = await this.getWeeklyProgress(userId);
      if (weeklyData.totalSessions > 0) {
        cards.push({
          type: 'weekly_progress',
          priority: 2,
          data: weeklyData,
        });
      }
    }

    // 2. Achievement (Recently unlocked badges)
    const recentBadges = await this.prisma.userAchievement.findMany({
      where: {
        userId,
        unlockedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        displayed: false,
      },
      orderBy: { unlockedAt: 'desc' },
      take: 4,
    });

    if (recentBadges.length > 0) {
      cards.push({
        type: 'achievement',
        priority: 2,
        data: {
          badges: recentBadges.map((b) => ({
            id: b.badgeType,
            icon: this.getBadgeIcon(b.badgeType),
            label: this.getBadgeLabel(b.badgeType),
            unlockedAt: b.unlockedAt,
          })),
        },
      });

      // Mark as displayed
      await this.prisma.userAchievement.updateMany({
        where: { id: { in: recentBadges.map((b) => b.id) } },
        data: { displayed: true },
      });
    }

    // 3. Trajectory Chart
    if (user.totalSessions >= 10) {
      const trajectoryData = await this.getTrajectoryData(userId);
      if (trajectoryData && trajectoryData.dataPoints.length >= 2) {
        const prediction = await this.getPredictionLabel(userId);
        cards.push({
          type: 'trajectory_chart',
          priority: 2,
          data: {
            ...trajectoryData,
            prediction,
          },
        });
      }
    }

    // Stage-specific cards
    if (stage === UserStage.NEW_USER) {
      cards.push({
        type: 'beginner_playbook',
        priority: 2,
        data: {
          tips: [
            { number: 1, text: 'Start with Maya AI to build confidence' },
            { number: 2, text: 'Complete 3 eBites daily' },
            { number: 3, text: 'Schedule your first P2P call' },
          ],
        },
      });
    }

    if (stage === UserStage.INACTIVE_USER) {
      const lastSessionAt =
        user.lastSessionAt || user.reliability?.lastSessionAt;
      const daysSinceActive = lastSessionAt
        ? Math.floor(
            (Date.now() - new Date(lastSessionAt).getTime()) /
              (1000 * 60 * 60 * 1000),
          )
        : 999;

      cards.push({
        type: 'skill_decay_warning',
        priority: 2,
        data: {
          daysSinceActive,
        },
      });
    }

    // ── Smart personalised cards (max 2 total) ──────────────────────────────
    let smartCardCount = 0;

    // SMART CARD 1: Gap card — user hasn't practised in >48 hours
    const gapSource = user.lastSessionAt || user.reliability?.lastSessionAt;
    if (gapSource && smartCardCount < 2) {
      const gapHours =
        (Date.now() - new Date(gapSource).getTime()) / (1000 * 60 * 60);
      if (gapHours > 48) {
        const daysSince = Math.floor(gapHours / 24);
        cards.push({
          type: 'tip',
          priority: 1,
          data: {
            title: `Back at it!`,
            body: `You haven't practiced in ${daysSince} days — a quick 5-min session keeps your streak alive`,
            action: 'start_maya_session',
            priority: 'high',
          },
        });
        smartCardCount++;
      }
    }

    // SMART CARD 2: Weak skill card — any pillar <50 or lowest is ≥10 below next lowest
    if (smartCardCount < 2) {
      const pillarTags = ['pronunciation', 'fluency', 'grammar', 'vocabulary'];
      const pillarDisplayNames: Record<string, string> = {
        pronunciation: 'pronunciation clarity',
        fluency: 'fluency',
        grammar: 'grammar',
        vocabulary: 'vocabulary',
      };

      const topicScores = await this.prisma.userTopicScore.findMany({
        where: {
          userId,
          topicTag: { in: pillarTags },
        },
        select: { topicTag: true, score: true },
      });

      if (topicScores.length > 0) {
        const sorted = [...topicScores].sort((a, b) => a.score - b.score);
        const lowest = sorted[0];
        const secondLowest = sorted[1];

        const triggerByAbsolute = lowest.score < 50;
        const triggerByGap =
          secondLowest !== undefined &&
          secondLowest.score - lowest.score >= 10;

        if (triggerByAbsolute || triggerByGap) {
          const weakestPillar = lowest.topicTag;
          const displayName = pillarDisplayNames[weakestPillar] ?? weakestPillar;
          cards.push({
            type: 'tip',
            priority: 2,
            data: {
              title: `Improve your ${displayName}`,
              body: `Your ${displayName} needs work — try a focused Maya session today`,
              action: 'open_maya_chat',
              actionParam: { topic: `${weakestPillar}_focus` },
              priority: 'medium',
            },
          });
          smartCardCount++;
        }
      }
    }

    // SMART CARD 3: CEFR conversation prompt — lowest priority, only if <2 smart cards
    if (smartCardCount < 2) {
      const cefrTopics: Record<string, string[]> = {
        A1: ['your daily routine', 'your favourite food', 'your hometown', 'your weekend plans'],
        A2: ['your daily routine', 'your favourite food', 'your hometown', 'your weekend plans'],
        B1: ['a news story you found interesting', 'a travel experience', 'your career goals', 'technology in daily life'],
        B2: ['a news story you found interesting', 'a travel experience', 'your career goals', 'technology in daily life'],
        C1: ['the ethics of AI', 'climate policy', 'a book that changed you', 'what makes a great leader'],
        C2: ['the ethics of AI', 'climate policy', 'a book that changed you', 'what makes a great leader'],
      };

      const level = (user.assessmentLevel as string) || 'B1';
      const topics = cefrTopics[level] ?? cefrTopics['B1'];
      const now = new Date();
      const dayOfYear = Math.floor(
        (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const topic = topics[dayOfYear % topics.length];
      const topicSlug = topic.replace(/[^a-z0-9]+/gi, '_').toLowerCase();

      cards.push({
        type: 'tip',
        priority: 3,
        data: {
          title: `Today's conversation topic`,
          body: `At your ${level} level, try discussing: "${topic}"`,
          action: 'open_maya_chat',
          actionParam: { topic: topicSlug },
          priority: 'low',
        },
      });
    }
    // ── End smart cards ─────────────────────────────────────────────────────

    return cards;
  }

  private async getWeeklyProgress(userId: string) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sessions = await this.prisma.conversationSession.count({
      where: {
        participants: { some: { userId } },
        startedAt: { gte: weekAgo },
        status: 'COMPLETED',
      },
    });

    return {
      totalSessions: sessions,
      label: `${sessions} sessions this week`,
    };
  }

  private async getTrajectoryData(userId: string) {
    const sessions = await this.prisma.analysis.findMany({
      where: { participant: { userId } },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        scores: true,
      },
    });

    if (sessions.length < 10) {
      return null; // Not enough data
    }

    // Group by week and calculate average score
    const weeklyData = new Map<string, number[]>();

    sessions.forEach((session) => {
      const weekStart = this.getWeekStart(session.createdAt);
      const weekKey = weekStart.toISOString().split('T')[0];

      const scores = session.scores as any;
      const avgScore =
        ((scores.fluency || 0) +
          (scores.grammar || 0) +
          (scores.vocabulary || 0) +
          (scores.pronunciation || 0)) /
        4;

      if (!weeklyData.has(weekKey)) {
        weeklyData.set(weekKey, []);
      }
      weeklyData.get(weekKey).push(avgScore);
    });

    // Calculate weekly averages
    const dataPoints = Array.from(weeklyData.entries())
      .map(([week, scores]) => ({
        week,
        score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return {
      dataPoints: dataPoints.map((p) => ({ score: p.score, date: p.week })),
      levelMarkers: [
        { level: 'A2', score: 35 },
        { level: 'B1', score: 55 },
        { level: 'B2', score: 70 },
        { level: 'C1', score: 85 },
      ],
    };
  }

  private async getPredictionLabel(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) return null;

    // Get last 4 weeks of data
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const sessions = await this.prisma.analysis.findMany({
      where: {
        participant: { userId },
        createdAt: { gte: fourWeeksAgo },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (sessions.length < 5) return null;

    // Calculate weekly growth rate
    const weeklyScores = this.groupByWeek(sessions);
    if (weeklyScores.length < 2) return null;

    const firstWeekAvg = weeklyScores[0];
    const lastWeekAvg = weeklyScores[weeklyScores.length - 1];
    const weeksElapsed = weeklyScores.length - 1;

    const weeklyGrowth = (lastWeekAvg - firstWeekAvg) / weeksElapsed;

    if (weeklyGrowth < 0.5) return null; // Not growing fast enough

    // Project to next level
    const currentScore = user.assessmentScore || 50;
    const nextMilestone = this.getNextMilestone(currentScore);

    if (!nextMilestone) return null;

    const pointsNeeded = nextMilestone.score - currentScore;
    const weeksToGoal = Math.ceil(pointsNeeded / weeklyGrowth);

    return `At this rate, you'll reach ${nextMilestone.level} in ~${weeksToGoal} weeks`;
  }

  private groupByWeek(sessions: any[]) {
    const weeklyMap = new Map<string, number[]>();
    sessions.forEach((s) => {
      const weekKey = this.getWeekStart(s.createdAt)
        .toISOString()
        .split('T')[0];
      const scores = s.scores as any;
      const avg =
        ((scores.fluency || 0) +
          (scores.grammar || 0) +
          (scores.vocabulary || 0) +
          (scores.pronunciation || 0)) /
        4;
      if (!weeklyMap.has(weekKey)) weeklyMap.set(weekKey, []);
      weeklyMap.get(weekKey).push(avg);
    });

    return Array.from(weeklyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map((entry) =>
        Math.round(entry[1].reduce((a, b) => a + b, 0) / entry[1].length),
      );
  }

  private getNextMilestone(currentScore: number) {
    const milestones = [
      { level: 'B1', score: 55 },
      { level: 'B2', score: 70 },
      { level: 'C1', score: 85 },
      { level: 'C2', score: 97 },
    ];
    return milestones.find((m) => m.score > currentScore);
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    return new Date(d.setDate(diff));
  }

  private getBadgeIcon(type: string) {
    return `badge_${type}`;
  }

  private getBadgeLabel(type: string) {
    return type.replace('_', ' ').toUpperCase();
  }
}
