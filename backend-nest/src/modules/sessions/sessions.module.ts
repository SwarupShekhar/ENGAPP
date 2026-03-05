import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { SessionsProcessor } from './sessions.processor';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { AssessmentModule } from '../assessment/assessment.module';
import { ReliabilityModule } from '../reliability/reliability.module';
import { HomeModule } from '../home/home.module';
import { BrainModule } from '../brain/brain.module';

@Module({
  imports: [
    PrismaModule,
    TasksModule,
    IntegrationsModule,
    forwardRef(() => AssessmentModule),
    BullModule.registerQueue({
      name: 'sessions',
    }),
    ReliabilityModule,
    HomeModule,
    BrainModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService, SessionsProcessor],
  exports: [SessionsService],
})
export class SessionsModule {}
// forced reload
