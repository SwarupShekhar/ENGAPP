import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AzureModule } from '../azure/azure.module';
import { LivekitService } from './livekit.service';
import { LivekitController } from './livekit.controller';
import { RealtimeAudioGateway } from './realtime-audio.gateway';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { EgressService } from './egress.service';
import { TranscriptionService } from './transcription.service';
import { LiveKitWebhookController } from './livekit-webhook.controller';
import { BrainModule } from '../brain/brain.module';
import { PronunciationModule } from '../pronunciation/pronunciation.module';
import { ScoringModule } from '../scoring/scoring.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    IntegrationsModule,
    forwardRef(() => SessionsModule),
    AzureModule,
    PrismaModule,
    BrainModule,
    PronunciationModule,
    ScoringModule,
    RedisModule,
  ],
  controllers: [LivekitController, LiveKitWebhookController],
  providers: [
    LivekitService,
    RealtimeAudioGateway,
    EgressService,
    TranscriptionService,
  ],
  exports: [LivekitService, EgressService, TranscriptionService],
})
export class LivekitModule {}
