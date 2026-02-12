import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { SessionsProcessor } from './sessions.processor';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { AssessmentModule } from '../assessment/assessment.module';

@Module({
    imports: [
        PrismaModule,
        TasksModule,
        IntegrationsModule,
        forwardRef(() => AssessmentModule),
        BullModule.registerQueue({
            name: 'sessions',
        }),
    ],
    controllers: [SessionsController],
    providers: [SessionsService, SessionsProcessor],
    exports: [SessionsService],
})
export class SessionsModule { }
