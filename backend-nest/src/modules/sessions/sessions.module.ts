import { Module, forwardRef } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { SessionsProcessor } from './sessions.processor';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { TasksModule } from '../tasks/tasks.module';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { ReliabilityModule } from '../reliability/reliability.module';
import { HomeModule } from '../home/home.module';
import { BrainModule } from '../brain/brain.module';
import { PronunciationModule } from '../pronunciation/pronunciation.module';
import { LivekitModule } from '../livekit/livekit.module';
import { InCallCoachingModule } from '../in-call-coaching/in-call-coaching.module';
import { SessionsQueuesModule } from '../../queues/sessions-queues.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    TasksModule,
    IntegrationsModule,
    forwardRef(() => AssessmentModule),
    SessionsQueuesModule,
    ReliabilityModule,
    HomeModule,
    BrainModule,
    PronunciationModule,
    forwardRef(() => LivekitModule),
    InCallCoachingModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService, SessionsProcessor],
  exports: [SessionsService],
})
export class SessionsModule {}
// forced reload
