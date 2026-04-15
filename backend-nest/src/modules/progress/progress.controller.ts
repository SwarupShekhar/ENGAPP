import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ClerkGuard } from '../auth/clerk.guard';

@Controller('progress')
@UseGuards(ClerkGuard)
export class ProgressController {
  constructor(
    private readonly progressService: ProgressService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('detailed-metrics')
  async getDetailedMetrics(@Request() req) {
    return this.progressService.getDetailedMetrics(req.user.id);
  }

  /** Diagnostic endpoint — shows raw DB state so zero-metrics bugs can be traced quickly. */
  @Get('debug-state')
  async debugState(@Request() req) {
    const userId = req.user.id;

    const [user, topicScores, assessmentSessions, conversationSessions, analyses] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            clerkId: true,
            currentStreak: true,
            totalSessions: true,
            assessmentScore: true,
            lastSessionAt: true,
          },
        }),
        this.prisma.userTopicScore.findMany({
          where: { userId, topicTag: { startsWith: 'pillar_' } },
        }),
        this.prisma.assessmentSession.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            overallLevel: true,
            overallScore: true,
            completedAt: true,
            skillBreakdown: true,
          },
        }),
        this.prisma.conversationSession.findMany({
          where: { participants: { some: { userId } } },
          orderBy: { startedAt: 'desc' },
          take: 5,
          select: { id: true, status: true, startedAt: true },
        }),
        this.prisma.analysis.findMany({
          where: { participant: { userId } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            cefrLevel: true,
            scores: true,
            createdAt: true,
            session: { select: { id: true, status: true } },
          },
        }),
      ]);

    return {
      user,
      pillarScores: topicScores,
      assessmentSessions,
      recentConversationSessions: conversationSessions,
      recentAnalyses: analyses,
    };
  }
}
