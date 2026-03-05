import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { StageResolverService } from './services/stage-resolver.service';
import { HeaderBuilder } from './builders/header.builder';
import { CTABuilder } from './builders/cta.builder';
import { SkillsBuilder } from './builders/skills.builder';
import { CardsBuilder } from './builders/cards.builder';

@Injectable()
export class HomeService {
  constructor(
    private prisma: PrismaService,
    private stageResolver: StageResolverService,
    private headerBuilder: HeaderBuilder,
    private ctaBuilder: CTABuilder,
    private skillsBuilder: SkillsBuilder,
    private cardsBuilder: CardsBuilder,
  ) {}

  async getHomeData(userId: string) {
    const stage = await this.stageResolver.getCachedStage(userId);

    const [header, primaryCTA, skills, contextualCards, weeklyActivity] =
      await Promise.all([
        this.headerBuilder.buildHeaderData(userId, stage),
        this.ctaBuilder.buildPrimaryCTA(userId, stage),
        this.skillsBuilder.buildSkillsData(userId, stage),
        this.cardsBuilder.buildContextualCards(userId, stage),
        this.getWeeklyActivity(userId),
      ]);

    return {
      stage,
      header,
      primaryCTA,
      skills,
      contextualCards,
      weeklyActivity,
    };
  }

  private async getWeeklyActivity(userId: string): Promise<number[]> {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Using SessionParticipant to count active sessions
    const sessions = await this.prisma.sessionParticipant.findMany({
      where: {
        userId,
        session: {
          startedAt: { gte: sevenDaysAgo },
          status: 'COMPLETED',
        },
      },
      include: {
        session: true,
      },
    });

    const activity = Array(7).fill(0);
    sessions.forEach((p) => {
      const dayIndex = Math.floor(
        (p.session.startedAt.getTime() - sevenDaysAgo.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      if (dayIndex >= 0 && dayIndex < 7) {
        activity[dayIndex]++;
      }
    });

    return activity;
  }
}
