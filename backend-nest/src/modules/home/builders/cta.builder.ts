import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { UserStage } from '../services/stage-resolver.service';

@Injectable()
export class CTABuilder {
  constructor(private prisma: PrismaService) {}

  async buildPrimaryCTA(userId: string, stage: UserStage) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        reliability: true,
      },
    });

    if (!user) return null;

    const p2pSessions = await this.prisma.conversationSession.count({
      where: {
        participants: { some: { userId } },
        structure: { not: 'assessment' }, // Assuming assessment sessions are different
        status: 'COMPLETED',
      },
    });

    const daysSinceAssessment = user.lastAssessmentAt
      ? Math.floor(
          (Date.now() - new Date(user.lastAssessmentAt).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 999;

    const lastSessionAt = user.lastSessionAt || user.reliability?.lastSessionAt;
    const daysSinceLastSession = lastSessionAt
      ? Math.floor(
          (Date.now() - new Date(lastSessionAt).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 0;

    const scoreGrowth = await this.calculateWeeklyGrowth(userId);

    // CTA Decision Tree
    let cta: any = {};

    if (stage === UserStage.INACTIVE_USER) {
      if (daysSinceLastSession >= 7) {
        cta = {
          type: 'restart_journey',
          title: `Pick up where you left off, ${user.fname}`,
          description: 'We saved your progress',
          buttonText: 'Restart My Journey',
          action: 'navigate_to_practice',
          accentColor: '#10B981',
        };
      } else if (daysSinceLastSession >= 3) {
        cta = {
          type: 'quick_practice',
          title: 'Quick 5-Min Session',
          description: 'Just to keep the habit',
          buttonText: '5-Min Practice',
          action: 'start_maya_session',
          accentColor: '#3B82F6',
        };
      }
    } else if (daysSinceAssessment >= 7 && stage >= UserStage.ACTIVE_BEGINNER) {
      cta = {
        type: 'reassessment',
        title: 'Time to remeasure your progress!',
        description: `It's been ${daysSinceAssessment} days since your last assessment`,
        buttonText: 'Take Reassessment',
        action: 'start_assessment',
        accentColor: '#8B5CF6',
      };
    } else if (
      user.assessmentScore &&
      user.assessmentScore >= 80 &&
      stage === UserStage.POWER_USER
    ) {
      const c2Criteria = await this.checkC2Criteria(userId);
      if (c2Criteria.allMet) {
        cta = {
          type: 'c2_assessment',
          title: "You're ready for C2 assessment!",
          description: 'All mastery criteria achieved',
          buttonText: 'Take C2 Assessment',
          action: 'start_c2_assessment',
          accentColor: '#F59E0B',
        };
      }
    } else if (p2pSessions >= 15 && scoreGrowth > 3) {
      cta = {
        type: 'challenge',
        title: "Challenge Yourself — you're B2-ready!",
        description: 'Try an IELTS practice session',
        buttonText: 'Find IELTS Partner',
        action: 'navigate_to_ielts',
        accentColor: '#EF4444',
      };
    } else if (p2pSessions >= 5 && p2pSessions < 15) {
      const weakestSkill = await this.getWeakestSkill(userId);
      cta = {
        type: 'focus_skill',
        title: `Today's Focus: ${weakestSkill.name}`,
        description: 'Strengthen your weak spots',
        buttonText: `Practice ${weakestSkill.name} Now`,
        action: 'start_focused_session',
        data: { skill: weakestSkill.key },
        accentColor: '#3B82F6',
      };
    } else if (p2pSessions >= 1 && p2pSessions < 5) {
      cta = {
        type: 'continue_practice',
        title: 'Practice Again?',
        description: 'Keep building your confidence',
        buttonText: 'Continue Practice',
        action: 'navigate_to_practice',
        accentColor: '#10B981',
      };
    } else if (p2pSessions === 0) {
      cta = {
        type: 'first_call',
        title: 'Start your first conversation',
        description: 'Connect with Maya AI or a real partner',
        buttonText: 'Start a Call',
        action: 'navigate_to_practice',
        accentColor: '#10B981',
      };
    }

    // Always add Maya chip as secondary option
    cta.mayaChip = {
      label: 'Ask Maya',
      action: 'open_maya_chat',
    };

    return cta;
  }

  private async calculateWeeklyGrowth(userId: string) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sessions = await this.prisma.analysis.findMany({
      where: {
        participant: { userId },
        createdAt: { gte: weekAgo },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (sessions.length < 2) return 0;

    const firstScore = (sessions[0].scores as any).overall || 0;
    const lastScore =
      (sessions[sessions.length - 1].scores as any).overall || 0;
    return lastScore - firstScore;
  }

  private async getWeakestSkill(userId: string) {
    const recentAnalyses = await this.prisma.analysis.findMany({
      where: { participant: { userId } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const skillAverages: Record<string, number> = {
      fluency: 0,
      grammar: 0,
      vocabulary: 0,
      pronunciation: 0,
    };

    if (recentAnalyses.length === 0) {
      return { key: 'fluency', name: 'Fluency', score: 0 };
    }

    recentAnalyses.forEach((analysis) => {
      const scores = analysis.scores as any;
      Object.keys(skillAverages).forEach((skill) => {
        skillAverages[skill] += scores[skill] || 0;
      });
    });

    Object.keys(skillAverages).forEach((skill) => {
      skillAverages[skill] /= recentAnalyses.length;
    });

    const weakest = Object.entries(skillAverages).sort(
      (a, b) => a[1] - b[1],
    )[0];

    return {
      key: weakest[0],
      name: weakest[0].charAt(0).toUpperCase() + weakest[0].slice(1),
      score: weakest[1],
    };
  }

  private async checkC2Criteria(userId: string) {
    // Simplified logic for C2 criteria
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const score = user?.assessmentScore || 0;
    const sessions = await this.prisma.conversationSession.count({
      where: { participants: { some: { userId } }, status: 'COMPLETED' },
    });

    const allMet = score >= 90 && sessions >= 100;
    return {
      allMet,
      criteria: [
        { label: 'Overall Score >= 90', met: score >= 90 },
        { label: 'Total Sessions >= 100', met: sessions >= 100 },
      ],
    };
  }
}
