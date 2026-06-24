import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PhraseOfDayService } from '../home/services/phrase-of-day.service';
import { NotificationService } from './notification.service';

@Injectable()
export class PhraseOfDayScheduler {
  private readonly logger = new Logger(PhraseOfDayScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly phraseOfDayService: PhraseOfDayService,
    private readonly notificationService: NotificationService,
  ) {}

  // 12:30 UTC — afternoon IST / morning US East; offset from word-of-day push.
  @Cron('30 12 * * *')
  async sendDailyPhraseOfTheDay(): Promise<void> {
    try {
      const tokenRows = await this.prisma.deviceToken.findMany({
        distinct: ['userId'],
        select: { userId: true },
      });

      if (!tokenRows.length) return;

      const todayStartUtc = new Date();
      todayStartUtc.setUTCHours(0, 0, 0, 0);
      const phrase = await this.phraseOfDayService.getPhraseOfTheDay();
      const userIds = tokenRows.map((r) => r.userId);

      const alreadyNotifiedRows = await this.prisma.notificationLog.findMany({
        where: {
          userId: { in: userIds },
          type: 'phrase_of_day',
          sentAt: { gte: todayStartUtc },
          status: { not: NotificationStatus.failed },
        },
        select: { userId: true },
        distinct: ['userId'],
      });
      const skipUserIds = new Set(alreadyNotifiedRows.map((r) => r.userId));

      await Promise.all(
        tokenRows.map(async (row) => {
          if (skipUserIds.has(row.userId)) return;

          await this.notificationService.notify(
            row.userId,
            'phrase_of_day',
            {
              phrase: phrase.phrase,
              definition: phrase.definition,
              example: phrase.example,
              source: phrase.source,
            },
            { skipDedupe: true },
          );
        }),
      );
    } catch (error) {
      this.logger.error(
        `[PhraseOfDayScheduler] Failed daily push dispatch: ${(error as Error).message}`,
      );
    }
  }
}
