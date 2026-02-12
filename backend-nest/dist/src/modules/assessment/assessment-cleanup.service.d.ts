import { PrismaService } from '../../database/prisma/prisma.service';
export declare class AssessmentCleanupService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    handleAbandonedAssessments(): Promise<void>;
}
