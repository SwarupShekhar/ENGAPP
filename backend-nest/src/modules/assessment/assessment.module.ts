import { Module, forwardRef } from '@nestjs/common';
import { AdaptiveQuestionSelector } from './adaptive-question.service';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';
import { AssessmentCleanupService } from './assessment-cleanup.service';
import { ConfigModule } from '@nestjs/config';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AzureModule } from '../azure/azure.module';
import { BrainModule } from '../brain/brain.module';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [ConfigModule, IntegrationsModule, forwardRef(() => SessionsModule), AzureModule, BrainModule, PrismaModule, AuthModule],
    controllers: [AssessmentController],
    providers: [AssessmentService, AssessmentCleanupService, AdaptiveQuestionSelector],
    exports: [AssessmentService],
})
export class AssessmentModule { }

