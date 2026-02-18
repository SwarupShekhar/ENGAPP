import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class PointsService {
  constructor(private prisma: PrismaService) {}

  async awardPoints(
    userId: string,
    amount: number,
    // reason: string, 
    category: 'p2p' | 'ai' | 'streak' | 'badge'
  ) {
    const userPoints = await this.prisma.userPoints.upsert({
      where: { userId },
      create: {
        userId,
        total: amount,
      },
      update: {
        total: { increment: amount },
      },
    });

    // Check for level up
    if (userPoints.total >= this.getXPForLevel(userPoints.level + 1)) {
      await this.levelUp(userId);
    }

    // TODO: Log points transaction if we had a Transaction model
    // await this.prisma.pointsTransaction.create({ ... });

    return userPoints;
  }

  async calculateSessionPoints(sessionId: string, userId: string): Promise<number> {
    const session = await this.prisma.conversationSession.findUnique({
      where: { id: sessionId },
      // include: { feedback: true }, // Assuming feedback relation exists or needs to be added
    });

    if (!session) return 0;

    let points = 0;

    // Base points for completion
    points += 50;

    // Duration bonus (max 100 points for 10+ min)
    // const durationMinutes = (session.duration || 0) / 60;
    // points += Math.min(100, Math.floor(durationMinutes * 10));

    // Objectives completion bonus
    // const myFeedback = session.feedback?.find(f => f.userId === userId);
    // if (myFeedback?.objectivesMet) {
    //   const metCount = Object.values(myFeedback.objectivesMet).filter(Boolean).length;
    //   points += metCount * 20; // 20 points per objective
    // }

    // Quality bonus
    // if (myFeedback?.overallScore >= 80) points += 50;
    // if (myFeedback?.overallScore >= 90) points += 100;

    // Partner rating bonus
    // if (myFeedback?.partnerRating >= 4) points += 30;
    // if (myFeedback?.partnerRating === 5) points += 50;

    // First session of the day bonus
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySessions = await this.prisma.conversationSession.count({
      where: {
        participants: { some: { userId } },
        createdAt: { gte: today },
      },
    });
    if (todaySessions === 1) points += 25; // Daily first session bonus

    return Math.floor(points);
  }

  private getXPForLevel(level: number): number {
    // Exponential curve: level 1 = 100 XP, level 2 = 250 XP, etc.
    return Math.floor(100 * Math.pow(level, 1.5));
  }

  private async levelUp(userId: string) {
    const userPoints = await this.prisma.userPoints.findUnique({
      where: { userId },
    });

    if (!userPoints) return;

    const newLevel = userPoints.level + 1;
    const newXPRequired = this.getXPForLevel(newLevel + 1);

    await this.prisma.userPoints.update({
      where: { userId },
      data: {
        level: newLevel,
      },
    });

    // Award level-up badge
    await this.checkAndAwardBadge(userId, 'level_milestone', newLevel);

    // Notify user
    // TODO: Send push notification "🎉 You reached Level {newLevel}!"
  }

  async checkAndAwardBadge(userId: string, badgeType: string, value?: number) {
    // Check if badge criteria met
    // Award if not already earned
    // Update user points
    // Placeholder implementation
  }
}
