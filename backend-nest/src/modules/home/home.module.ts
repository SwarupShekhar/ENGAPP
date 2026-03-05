import { Module } from '@nestjs/common';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { StageResolverService } from './services/stage-resolver.service';
import { SessionHandlerService } from './services/session-handler.service';
import { HeaderBuilder } from './builders/header.builder';
import { CTABuilder } from './builders/cta.builder';
import { SkillsBuilder } from './builders/skills.builder';
import { CardsBuilder } from './builders/cards.builder';
import { WeeklySummaryBuilder } from './builders/weekly-summary.builder';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { BrainModule } from '../brain/brain.module';

@Module({
  imports: [PrismaModule, RedisModule, BrainModule],
  controllers: [HomeController],
  providers: [
    HomeService,
    StageResolverService,
    SessionHandlerService,
    HeaderBuilder,
    CTABuilder,
    SkillsBuilder,
    CardsBuilder,
    WeeklySummaryBuilder,
  ],
  exports: [HomeService, SessionHandlerService],
})
export class HomeModule {}
