import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';

export enum UserStage {
  NEW_USER = 1,
  ACTIVE_BEGINNER = 2,
  ENGAGED_LEARNER = 3,
  POWER_USER = 4,
  INACTIVE_USER = 5,
}

@Injectable()
export class StageResolverService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async resolveUserStage(userId: string): Promise<UserStage> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        reliability: true,
        profile: true,
      },
    });

    if (!user) return UserStage.NEW_USER;

    const now = new Date();

    // CRITICAL: Inactivity check ALWAYS runs first
    const lastSessionAt = user.lastSessionAt || user.reliability?.lastSessionAt;

    if (lastSessionAt) {
      const daysSinceLastSession = Math.floor(
        (now.getTime() - new Date(lastSessionAt).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      if (daysSinceLastSession >= 7) {
        return UserStage.INACTIVE_USER;
      }
    }

    // Session-based progression
    const totalSessions =
      user.totalSessions || user.reliability?.totalSessions || 0;
    const currentStreak = user.currentStreak || user.profile?.streak || 0;

    if (totalSessions === 0) {
      return UserStage.NEW_USER;
    } else if (totalSessions >= 1 && totalSessions <= 15) {
      return UserStage.ACTIVE_BEGINNER;
    } else if (totalSessions >= 16 && totalSessions <= 74) {
      return UserStage.ENGAGED_LEARNER;
    } else if (totalSessions >= 75 && currentStreak >= 30) {
      return UserStage.POWER_USER;
    }

    // Fallback
    return UserStage.ENGAGED_LEARNER;
  }

  async getCachedStage(userId: string): Promise<UserStage> {
    const cacheKey = `user:${userId}:stage`;
    const stageStr = await this.redis.get(cacheKey);

    if (!stageStr) {
      const stage = await this.resolveUserStage(userId);
      await this.redis.set(cacheKey, stage.toString(), 300); // 5 min TTL
      return stage;
    }

    return parseInt(stageStr, 10) as UserStage;
  }
}
