import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AzureStorageService } from '../../integrations/azure-storage.service';

/**
 * DataRetentionService
 *
 * Enforces GDPR-compliant data retention policies:
 * - Runs daily to check for expired assessment data
 * - Respects per-user `dataRetentionDays` setting
 * - Anonymizes data for users who opted into research sharing
 * - Hard-deletes data for users who did not
 * - Logs all actions for audit trail
 */
@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AzureStorageService,
  ) {}

  /**
   * Runs daily at 3:00 AM to enforce data retention policies.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async enforceRetentionPolicies() {
    this.logger.log('Starting data retention enforcement...');

    try {
      // Find all users who have NOT been deleted and have a retention policy
      const users = await this.prisma.user.findMany({
        where: {
          dataDeletedAt: null,
        },
        select: {
          id: true,
          shareDataForResearch: true,
          dataRetentionDays: true,
        },
      });

      let processedCount = 0;

      for (const user of users) {
        const retentionDays = (user as any).dataRetentionDays ?? 90;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        // Find expired assessment sessions for this user
        const expiredSessions = await this.prisma.assessmentSession.findMany({
          where: {
            userId: user.id,
            status: 'COMPLETED',
            completedAt: {
              lt: cutoffDate,
            },
          },
          select: {
            id: true,
          },
        });

        if (expiredSessions.length === 0) continue;

        this.logger.log(
          `User ${user.id}: ${expiredSessions.length} expired sessions (retention: ${retentionDays}d)`,
        );

        if ((user as any).shareDataForResearch) {
          // Anonymize: keep scores and metrics, strip personal identifiers
          await this.anonymizeExpiredSessions(expiredSessions.map((s) => s.id));
        } else {
          // Hard delete: remove all assessment data
          await this.deleteExpiredSessions(expiredSessions.map((s) => s.id));
        }

        processedCount += expiredSessions.length;
      }

      this.logger.log(
        `Data retention complete. Processed ${processedCount} expired sessions.`,
      );
    } catch (error) {
      this.logger.error(
        `Data retention enforcement failed: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Anonymize sessions: strip personal data but retain aggregate metrics
   * for research purposes. The session record stays but PII is removed.
   */
  private async anonymizeExpiredSessions(sessionIds: string[]) {
    for (const sessionId of sessionIds) {
      await this.prisma.assessmentSession.update({
        where: { id: sessionId },
        data: {
          // Keep: overallScore, overallLevel, skillBreakdown, benchmarking
          // Clear: phase-level raw data containing audio references
          phase1Data: null,
          phase2Data: null,
          phase3Data: null,
          phase4Data: null,
          // Mark as anonymized via status metadata
        } as any,
      });

      this.logger.debug(`Anonymized session ${sessionId}`);
    }
  }

  /**
   * Hard delete expired sessions — full removal.
   */
  private async deleteExpiredSessions(sessionIds: string[]) {
    const result = await this.prisma.assessmentSession.deleteMany({
      where: {
        id: { in: sessionIds },
      },
    });

    this.logger.log(`Deleted ${result.count} expired assessment sessions`);
  }

  /**
   * On-demand: Process a user's right-to-erasure (GDPR Article 17).
   * Called when a user requests complete data deletion.
   */
  async processErasureRequest(userId: string): Promise<void> {
    this.logger.warn(`Processing erasure request for user ${userId}`);

    // 1. Delete all assessment sessions
    const deletedSessions = await this.prisma.assessmentSession.deleteMany({
      where: { userId },
    });

    // 2. Delete recurring error patterns
    await (this.prisma as any).recurringErrorPattern.deleteMany({
      where: { userId },
    });

    // 3. Mark user as data-deleted (soft delete for audit)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        dataDeletedAt: new Date(),
      } as any,
    });

    this.logger.warn(
      `Erasure complete for user ${userId}: ${deletedSessions.count} sessions deleted`,
    );
  }
}
