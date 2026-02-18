import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class ReliabilityService {
  constructor(private prisma: PrismaService) {}

  async calculateReliability(userId: string): Promise<number> {
    const reliability = await this.prisma.userReliability.findUnique({
      where: { userId },
    });

    if (!reliability) {
      // Initialize
      await this.prisma.userReliability.create({
        data: { userId, reliabilityScore: 100 },
      });
      return 100;
    }

    // Calculate based on recent behavior
    const completionRate = reliability.totalSessions > 0
      ? (reliability.completedSessions / reliability.totalSessions) * 100
      : 100;

    // Penalty for bad behavior
    let earlyExitPenalty = reliability.earlyExits * 5;
    const noShowPenalty = reliability.noShows * 10;
    const reportPenalty = reliability.reportsReceived * 15;

    // Grace period check (90s) & Disconnect Reason
    if (reliability.lastDisconnectAt && reliability.lastSessionAt) {
        const timeDiff = reliability.lastDisconnectAt.getTime() - reliability.lastSessionAt.getTime();
        const gracePeriod = 90 * 1000; // 90 seconds
        
        // If disconnected within grace period or due to network drop, reduce penalty
        if (timeDiff < gracePeriod || reliability.lastDisconnectReason === 'network_drop') {
            earlyExitPenalty = Math.max(0, earlyExitPenalty - 10); // Reduce penalty
        }
    }

    // Bonus for good behavior
    const streakBonus = Math.min(reliability.consecutiveCompletions * 2, 20);

    // Final score (clamped between 60-100 as per new requirement)
    // Floor is 60 to prevent social stratification and churn
    const FLOOR = 60;
    
    const rawScore = completionRate - earlyExitPenalty - noShowPenalty - reportPenalty + streakBonus;

    const score = Math.max(
      FLOOR,
      Math.min(100, rawScore)
    );

    // Update in database
    await this.prisma.userReliability.update({
      where: { userId },
      data: { reliabilityScore: score },
    });

    return score;
  }

  async getUserReliability(userId: string) {
    const reliability = await this.prisma.userReliability.findUnique({
      where: { userId },
    });

    if (!reliability) {
        // Return default structure if not yet initialized
        return { reliabilityScore: 100, tier: 'bronze' };
    }
    return reliability;
  }

  async recordSessionStart(userId: string) {
    await this.prisma.userReliability.upsert({
      where: { userId },
      create: {
        userId,
        totalSessions: 1,
        lastSessionAt: new Date(),
      },
      update: {
        totalSessions: { increment: 1 },
        lastSessionAt: new Date(),
        // Reset disconnect info on new session
        lastDisconnectAt: null,
        lastDisconnectReason: null,
      },
    });
  }

  async recordDisconnect(userId: string, reason: string = 'unknown') {
      await this.prisma.userReliability.update({
          where: { userId },
          data: {
              lastDisconnectAt: new Date(),
              lastDisconnectReason: reason
          }
      });
  }

  async recordSessionComplete(userId: string, sessionDuration: number, expectedDuration: number) {
    const completionRate = expectedDuration > 0 ? sessionDuration / expectedDuration : 1;

    if (completionRate >= 0.9) {
      // Full completion
      await this.prisma.userReliability.update({
        where: { userId },
        data: {
          completedSessions: { increment: 1 },
          consecutiveCompletions: { increment: 1 },
        },
      });
    } else if (completionRate >= 0.5) {
      // Partial completion (exited early but stayed >50%)
      await this.prisma.userReliability.update({
        where: { userId },
        data: {
          earlyExits: { increment: 1 },
          consecutiveCompletions: 0, // Break streak
        },
      });
    } else {
      // Major early exit (<50%)
      await this.prisma.userReliability.update({
        where: { userId },
        data: {
          earlyExits: { increment: 2 }, // Double penalty
          consecutiveCompletions: 0,
        },
      });
    }

    // Recalculate score
    await this.calculateReliability(userId);
  }

  async recordNoShow(userId: string) {
    await this.prisma.userReliability.update({
      where: { userId },
      data: {
        noShows: { increment: 1 },
        consecutiveCompletions: 0,
      },
    });

    await this.calculateReliability(userId);
  }

  async recordReport(reportedUserId: string, reason: string) {
    await this.prisma.userReliability.update({
      where: { userId: reportedUserId },
      data: {
        reportsReceived: { increment: 1 },
      },
    });

    // Severe penalty if multiple reports
    const reliability = await this.prisma.userReliability.findUnique({
      where: { userId: reportedUserId },
    });

    if (reliability && reliability.reportsReceived >= 3) {
      // Automatic tier downgrade
      await this.updateTier(reportedUserId);
    }

    await this.calculateReliability(reportedUserId);
  }

  async updateTier(userId: string) {
    const reliability = await this.prisma.userReliability.findUnique({
      where: { userId },
    });

    if (!reliability) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { points: true },
    });

    // Tier calculation based on:
    // 1. Reliability score (40% weight)
    // 2. Total sessions (30% weight)
    // 3. User level (30% weight)

    const reliabilityWeight = reliability.reliabilityScore * 0.4;
    const sessionWeight = Math.min(reliability.totalSessions / 50, 1) * 30; // Max at 50 sessions
    const levelWeight = (user?.points?.level || 1) / 100 * 30; // Max at level 100

    const tierScore = reliabilityWeight + sessionWeight + levelWeight;

    // Silent tier logic: Below bronze is theoretically possible but we display bronze
    let tier = 'bronze'; 
    if (tierScore >= 80) tier = 'platinum';
    else if (tierScore >= 60) tier = 'gold';
    else if (tierScore >= 40) tier = 'silver';
    // Tier below 40 remains 'bronze' visually but is internally tracked via low score.

    await this.prisma.userReliability.update({
      where: { userId },
      data: { tier },
    });

    return tier;
  }

  async getReliabilityBadge(userId: string): Promise<{ color: string; label: string; score: number } | null> {
    const reliability = await this.prisma.userReliability.findUnique({
      where: { userId },
    });

    const score = reliability?.reliabilityScore || 100;

    // Silent tier: If score < 65 (close to floor), don't show badge to avoid shaming
    if (score < 65) return null;

    if (score >= 90) return { color: '#10b981', label: '🌟 Highly Reliable', score };
    if (score >= 75) return { color: '#3b82f6', label: '✓ Reliable', score };
    if (score >= 60) return { color: '#f59e0b', label: '⚠️ Improving', score };
    
    return null; // Should not happen given floor, but safe fallback
  }
}
