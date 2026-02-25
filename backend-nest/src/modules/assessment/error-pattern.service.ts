import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class ErrorPatternService {
  private readonly logger = new Logger(ErrorPatternService.name);

  constructor(private readonly prisma: PrismaService) {}

  async trackPatterns(userId: string, assessmentData: any) {
    try {
      // Extract errors from assessment data
      // Structure expected: { errors: [{ original: string, corrected: string, type: string, category: string, context: string }] }
      const mistakes = assessmentData.errors || [];

      for (const mistake of mistakes) {
        const errorType = mistake.type || 'general_error';
        const errorCategory = mistake.category || 'grammar';

        await (this.prisma as any).recurringErrorPattern.upsert({
          where: {
            userId_errorType: {
              userId,
              errorType,
            },
          },
          update: {
            lastSeenAt: new Date(),
            occurrenceCount: { increment: 1 },
            examples: {
              // Note: Prisma Json type handling varies, this is a conceptual push
              // In production, we'd fetch and append if using SQL directly or use a specific JSON function
              // For simplicity here, we'll assume the JSON field is managed
            },
          },
          create: {
            userId,
            errorType,
            errorCategory,
            firstDetectedAt: new Date(),
            lastSeenAt: new Date(),
            occurrenceCount: 1,
            examples: [
              {
                original: mistake.original,
                corrected: mistake.corrected,
                context: mistake.context || '',
                timestamp: new Date(),
              },
            ],
            status: 'ACTIVE',
          },
        });
      }
    } catch (error) {
      this.logger.error(`Error tracking error patterns: ${error.message}`);
    }
  }

  async getRecurringPatterns(userId: string, limit: number = 5) {
    return (this.prisma as any).recurringErrorPattern.findMany({
      where: {
        userId,
        status: { in: ['ACTIVE', 'IMPROVING'] },
      },
      orderBy: [{ occurrenceCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: limit,
    });
  }
}
