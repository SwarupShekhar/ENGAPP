import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';

export interface SessionData {
  type: 'p2p' | 'maya' | 'ebite';
  durationSeconds: number;
  skills: {
    fluency: number;
    grammar: number;
    vocabulary: number;
    pronunciation: number;
  };
}

@Injectable()
export class SessionHandlerService {
  private readonly logger = new Logger(SessionHandlerService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async handleSessionComplete(userId: string, sessionData: SessionData) {
    this.logger.log(
      `Handling session complete for user ${userId}, type: ${sessionData.type}`,
    );

    // Create a new analysis record to simulate session history since Prisma schema uses Analysis for skills per session
    // Or we just update the user's total sessions directly. Let's do that.

    // We already have ConversationSession and Analysis, so we might just be updating user total sessions here
    // But since the roadmap requires us to use updateStreak and checkAchievements, we will implement this.

    // 2. Get user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      this.logger.error(
        `User ${userId} not found when handling session complete.`,
      );
      return null;
    }

    // 3. Update session count
    const newSessionCount = user.totalSessions + 1;

    // 4. Update streak
    const newStreak = await this.updateStreak(
      userId,
      user.lastSessionAt,
      user.currentStreak,
    );

    // 5. Update user record
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totalSessions: newSessionCount,
        lastSessionAt: new Date(),
        currentStreak: newStreak,
      },
    });

    // 6. Check and unlock achievements
    await this.checkAchievements(
      userId,
      newSessionCount,
      newStreak,
      user.assessmentScore,
      user.initialAssessmentScore,
    );

    // 7. Invalidate all caches for this user
    await this.invalidateUserCaches(userId);

    this.logger.log(
      `Session handled for user ${userId}. New streak: ${newStreak}, total sessions: ${newSessionCount}`,
    );

    return {
      newStreak,
      totalSessions: newSessionCount,
    };
  }

  private async updateStreak(
    userId: string,
    lastSessionAt: Date | null,
    currentStreak: number,
  ): Promise<number> {
    if (!lastSessionAt) {
      // First session ever
      return 1;
    }

    const now = new Date();
    const hoursSinceLastSession =
      (now.getTime() - lastSessionAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastSession <= 24) {
      // Same day - don't increment
      return currentStreak;
    } else if (hoursSinceLastSession <= 48) {
      // Next day - increment streak
      return currentStreak + 1;
    } else {
      // Streak broken - record it and restart
      if (currentStreak > 0) {
        await this.prisma.streakHistory.create({
          data: {
            userId,
            streakDays: currentStreak,
            endedAt: now,
            reason: 'broken',
          },
        });
      }
      return 1;
    }
  }

  private async checkAchievements(
    userId: string,
    sessionCount: number,
    streak: number,
    currentScore: number | null,
    initialScore: number | null,
  ) {
    const existingBadges = await this.prisma.userAchievement.findMany({
      where: { userId },
      select: { badgeType: true },
    });

    const existingTypes = existingBadges.map((b) => b.badgeType);
    const newBadges: string[] = [];

    // Streak badges
    if (streak >= 7 && !existingTypes.includes('streak_7'))
      newBadges.push('streak_7');
    if (streak >= 20 && !existingTypes.includes('streak_20'))
      newBadges.push('streak_20');
    if (streak >= 50 && !existingTypes.includes('streak_50'))
      newBadges.push('streak_50');

    // Session badges
    if (sessionCount >= 10 && !existingTypes.includes('sessions_10'))
      newBadges.push('sessions_10');
    if (sessionCount >= 50 && !existingTypes.includes('sessions_50'))
      newBadges.push('sessions_50');
    if (sessionCount >= 100 && !existingTypes.includes('sessions_100'))
      newBadges.push('sessions_100');

    // Score improvement badges
    const improvement = (currentScore || 0) - (initialScore || 0);

    if (improvement >= 10 && !existingTypes.includes('points_10'))
      newBadges.push('points_10');
    if (improvement >= 20 && !existingTypes.includes('points_20'))
      newBadges.push('points_20');
    if (improvement >= 50 && !existingTypes.includes('points_50'))
      newBadges.push('points_50');

    // P2P badges
    const p2pCount = await this.prisma.sessionParticipant.count({
      where: { userId },
    });

    if (p2pCount >= 5 && !existingTypes.includes('p2p_5'))
      newBadges.push('p2p_5');
    if (p2pCount >= 10 && !existingTypes.includes('p2p_10'))
      newBadges.push('p2p_10');
    if (p2pCount >= 50 && !existingTypes.includes('p2p_50'))
      newBadges.push('p2p_50');

    // Insert new achievements
    for (const badgeType of newBadges) {
      await this.prisma.userAchievement.create({
        data: {
          userId,
          badgeType,
          unlockedAt: new Date(),
        },
      });
    }

    return newBadges;
  }

  private async invalidateUserCaches(userId: string) {
    await Promise.all([
      this.redis.del(`user:${userId}:stage`),
      this.redis.del(`user:${userId}:feed`),
      this.redis.del(`user:${userId}:rank`),
      this.redis.del(`user:${userId}:percentile`),
    ]);
  }
}
