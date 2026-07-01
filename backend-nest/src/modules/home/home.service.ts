import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { StageResolverService } from './services/stage-resolver.service';
import { HeaderBuilder } from './builders/header.builder';
import { CTABuilder } from './builders/cta.builder';
import { SkillsBuilder } from './builders/skills.builder';
import { CardsBuilder } from './builders/cards.builder';
import { CommunityBuilder } from './builders/community.builder';
import { WordOfDayService } from './services/word-of-day.service';
import { PhraseOfDayService } from './services/phrase-of-day.service';

@Injectable()
export class HomeService {
  constructor(
    private prisma: PrismaService,
    private stageResolver: StageResolverService,
    private headerBuilder: HeaderBuilder,
    private ctaBuilder: CTABuilder,
    private skillsBuilder: SkillsBuilder,
    private cardsBuilder: CardsBuilder,
    private communityBuilder: CommunityBuilder,
    private wordOfDayService: WordOfDayService,
    private phraseOfDayService: PhraseOfDayService,
  ) {}

  async getHomeData(userId: string) {
    const stage = await this.stageResolver.getCachedStage(userId);

    const [header, primaryCTA, skills, contextualCards, weeklyActivity, wordOfTheDay, phraseOfTheDay, dailyPracticeStatus, community, listenVoicePreference] =
      await Promise.all([
        this.headerBuilder.buildHeaderData(userId, stage),
        this.ctaBuilder.buildPrimaryCTA(userId, stage),
        this.skillsBuilder.buildSkillsData(userId, stage),
        this.cardsBuilder.buildContextualCards(userId, stage),
        this.getWeeklyActivity(userId),
        this.wordOfDayService.getWordOfTheDay(),
        this.phraseOfDayService.getPhraseOfTheDay(),
        this.getDailyPracticeStatus(userId),
        this.communityBuilder.buildCommunityData(userId),
        this.getListenVoicePreference(userId),
      ]);

    return {
      stage,
      header,
      primaryCTA,
      skills,
      contextualCards,
      weeklyActivity,
      wordOfTheDay,
      phraseOfTheDay,
      dailyPracticeStatus,
      community,
      listenVoicePreference,
    };
  }

  private async getListenVoicePreference(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dailyListenVoice: true, dailyListenVoiceChosen: true },
    });
    const voice = user?.dailyListenVoice === 'Jasper' ? 'Jasper' : 'Kiki';
    return {
      voice,
      chosen: user?.dailyListenVoiceChosen ?? false,
    };
  }

  private async getDailyPracticeStatus(userId: string) {
    const today = new Date();
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const rows = await this.prisma.userDailyPracticeCompletion.findMany({
      where: { userId, practiceDate: date },
    });
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]));
    return {
      date: date.toISOString().slice(0, 10),
      phrase: {
        done: !!byKind['phrase'],
        completedAt: byKind['phrase']?.completedAt?.toISOString(),
        bestScore: byKind['phrase']?.bestScore ?? undefined,
      },
      word: {
        done: !!byKind['word'],
        completedAt: byKind['word']?.completedAt?.toISOString(),
        bestScore: byKind['word']?.bestScore ?? undefined,
      },
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
