import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConversationalTutorService } from './conversational-tutor.service';
import { ConversationalTutorController } from './conversational-tutor.controller';
import { MayaSessionProcessor } from './maya-session.processor';
import { MayaSessionStore } from './maya-session.store';
import { MayaSessionCleanupService } from './maya-session-cleanup.service';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { ReelsModule } from '../reels/reels.module';
import { InCallCoachingModule } from '../in-call-coaching/in-call-coaching.module';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { RedisModule } from '../../redis/redis.module';
import { PronunciationModule } from '../pronunciation/pronunciation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionsQueuesModule } from '../../queues/sessions-queues.module';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [
    HttpModule,
    PrismaModule,
    ReelsModule,
    InCallCoachingModule,
    IntegrationsModule,
    RedisModule,
    PronunciationModule,
    NotificationsModule,
    SessionsQueuesModule,
    ScoringModule,
  ],
  controllers: [ConversationalTutorController],
  providers: [
    ConversationalTutorService,
    MayaSessionProcessor,
    MayaSessionStore,
    MayaSessionCleanupService,
  ],
  exports: [ConversationalTutorService],
})
export class ConversationalTutorModule {}
