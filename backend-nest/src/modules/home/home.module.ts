import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { HomeController } from './home.controller';
import { VocabularyController } from './vocabulary.controller';
import { HomeService } from './home.service';
import { StageResolverService } from './services/stage-resolver.service';
import { SessionHandlerService } from './services/session-handler.service';
import { HeaderBuilder } from './builders/header.builder';
import { CTABuilder } from './builders/cta.builder';
import { SkillsBuilder } from './builders/skills.builder';
import { CardsBuilder } from './builders/cards.builder';
import { CommunityBuilder } from './builders/community.builder';
import { WeeklySummaryBuilder } from './builders/weekly-summary.builder';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { BrainModule } from '../brain/brain.module';
import { ProgressModule } from '../progress/progress.module';
import { WordOfDayService } from './services/word-of-day.service';
import { PhraseOfDayService } from './services/phrase-of-day.service';
import { DailyTtsService } from './services/daily-tts.service';
import { VocabularyService } from './services/vocabulary.service';
import { DailyTtsScheduler } from './daily-tts.scheduler';

@Module({
  imports: [PrismaModule, RedisModule, BrainModule, ProgressModule, HttpModule],
  controllers: [HomeController, VocabularyController],
  providers: [
    HomeService,
    StageResolverService,
    SessionHandlerService,
    HeaderBuilder,
    CTABuilder,
    SkillsBuilder,
    CardsBuilder,
    CommunityBuilder,
    WeeklySummaryBuilder,
    WordOfDayService,
    PhraseOfDayService,
    DailyTtsService,
    VocabularyService,
    DailyTtsScheduler,
  ],
  exports: [
    HomeService,
    SessionHandlerService,
    WordOfDayService,
    PhraseOfDayService,
    DailyTtsService,
    VocabularyService,
  ],
})
export class HomeModule {}
