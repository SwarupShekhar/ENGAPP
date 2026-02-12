import { Job } from 'bull';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AssessmentService } from '../assessment/assessment.service';
import { TasksService } from '../tasks/tasks.service';
export declare class SessionsProcessor {
    private prisma;
    private assessmentService;
    private tasksService;
    private readonly logger;
    constructor(prisma: PrismaService, assessmentService: AssessmentService, tasksService: TasksService);
    handleProcessSession(job: Job<any>): Promise<void>;
}
