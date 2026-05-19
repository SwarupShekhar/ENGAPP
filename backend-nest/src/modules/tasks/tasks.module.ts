import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { BrainModule } from '../brain/brain.module';
import { PronunciationModule } from '../pronunciation/pronunciation.module';
import { PointsService } from '../gamification/points.service';

@Module({
    imports: [PrismaModule, BrainModule, PronunciationModule],
    controllers: [TasksController],
    providers: [TasksService, PointsService],
    exports: [TasksService],
})
export class TasksModule { }
