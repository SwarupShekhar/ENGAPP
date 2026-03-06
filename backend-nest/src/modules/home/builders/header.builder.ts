import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { UserStage } from '../services/stage-resolver.service';

@Injectable()
export class HeaderBuilder {
  constructor(private prisma: PrismaService) {}

  async buildHeaderData(userId: string, stage: UserStage) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    if (!user) return null;

    const streak = user.currentStreak || user.profile?.streak || 0;
    let score = user.assessmentScore || 0;
    let level = user.assessmentLevel || user.overallLevel || user.level || 'A2';

    // Fallback for score/level if not in user record (sync with Progress screen)
    if (score === 0 || !user.assessmentLevel) {
      const latestAssessment = await this.prisma.assessmentSession.findFirst({
        where: { userId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
      });

      if (latestAssessment) {
        score = score || Math.round(latestAssessment.overallScore || 0);
        level = level === 'A2' ? latestAssessment.overallLevel || level : level;
      }
    }

    // Calculate percentile
    const percentile = await this.calculatePercentile(userId);

    // Determine greeting based on stage and streak
    let greeting = 'Welcome!';
    let specialBadge: string | null = null;

    if (stage === UserStage.INACTIVE_USER) {
      greeting = `We miss you, ${user.fname}!`;
    } else if (streak >= 50) {
      greeting = `${streak} Day Streak! LEGENDARY!`;
      specialBadge = 'Top 3% Globally';
    } else if (streak >= 21) {
      greeting = `${streak} Day Streak! You're crushing it!`;
      specialBadge = percentile <= 15 ? `Top ${percentile}%` : null;
    } else if (streak >= 7) {
      greeting = `${streak} Day Streak! You're in the top ${percentile}%!`;
    } else if (streak >= 1) {
      greeting = `${streak} Day Streak! Keep it going!`;
    }

    // Calculate delta from start
    const initialScore = user.initialAssessmentScore || score;
    const scoreDelta = score - initialScore;

    // Next goal calculation
    const goalTargets: Record<string, number> = {
      A1: 35,
      A2: 55,
      B1: 70,
      B2: 80,
      C1: 90,
      C2: 97,
    };
    const nextLevel = this.getNextLevel(level);
    const goalTarget = goalTargets[nextLevel];
    const goalLabel = `Reach ${nextLevel}`;

    // Fetch latest assessment ID for results button
    const latestAssessment = await this.prisma.assessmentSession.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: { id: true },
    });

    return {
      greeting,
      userName: user.fname,
      level,
      score,
      streak,
      percentile:
        specialBadge || (percentile <= 20 ? `Top ${percentile}%` : null),
      specialBadge,
      scoreDelta: scoreDelta > 0 ? `+${scoreDelta} from start` : null,
      goalTarget,
      goalLabel,
      lastSessionDate:
        stage === UserStage.INACTIVE_USER ? user.lastSessionAt || null : null,
      latestAssessmentId: latestAssessment?.id || null,
    };
  }

  private getNextLevel(currentLevel: string) {
    const progression = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const currentIndex = progression.indexOf(currentLevel);
    return progression[currentIndex + 1] || 'C2';
  }

  private async calculatePercentile(userId: string) {
    // Query to find user's rank among all active users
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return 100;

    const rank = await this.prisma.user.count({
      where: {
        assessmentScore: { gt: user.assessmentScore || 0 },
        lastSessionAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });

    const totalActive = await this.prisma.user.count({
      where: {
        lastSessionAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });

    if (totalActive === 0) return 100;
    return Math.ceil(((rank + 1) / totalActive) * 100);
  }
}
