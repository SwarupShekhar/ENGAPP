import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdaptiveQuestionSelector } from './adaptive-question.service';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';
import { AssessmentCleanupService } from './assessment-cleanup.service';
import { BenchmarkingService } from './benchmarking.service';
import { ErrorPatternService } from './error-pattern.service';
import { ReadinessService } from './readiness.service';
import { DataRetentionService } from './data-retention.service';
import { ConfigModule } from '@nestjs/config';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AzureModule } from '../azure/azure.module';
import { BrainModule } from '../brain/brain.module';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [
    ConfigModule,
    IntegrationsModule,
    ScheduleModule.forRoot(),
    forwardRef(() => SessionsModule),
    AzureModule,
    BrainModule,
    PrismaModule,
    AuthModule,
    TasksModule,
  ],
  controllers: [AssessmentController],
  providers: [
    AssessmentService,
    AssessmentCleanupService,
    AdaptiveQuestionSelector,
    BenchmarkingService,
    ErrorPatternService,
    ReadinessService,
    DataRetentionService,
  ],
  exports: [AssessmentService],
})
export class AssessmentModule {}
