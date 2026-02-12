import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class AssessmentCleanupService {
    private readonly logger = new Logger(AssessmentCleanupService.name);

    constructor(private readonly prisma: PrismaService) { }

    @Cron(CronExpression.EVERY_MINUTE)
    async handleAbandonedAssessments() {
        this.logger.debug('Checking for abandoned assessments...');

        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

        const count = await this.prisma.assessmentSession.updateMany({
            where: {
                status: 'IN_PROGRESS',
                createdAt: {
                    lt: tenMinutesAgo,
                },
            },
            data: {
                status: 'ABANDONED',
            },
        });

        if (count.count > 0) {
            this.logger.log(`Marked ${count.count} assessments as ABANDONED`);
        }
    }
}
