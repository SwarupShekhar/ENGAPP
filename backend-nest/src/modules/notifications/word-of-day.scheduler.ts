import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { WordOfDayService } from '../home/services/word-of-day.service';
import { NotificationService } from './notification.service';

@Injectable()
export class WordOfDayScheduler {
  private readonly logger = new Logger(WordOfDayScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wordOfDayService: WordOfDayService,
    private readonly notificationService: NotificationService,
  ) {}

  // 13:00 UTC daily -> evening in IST and afternoon in Europe.
  @Cron('0 13 * * *')
  async sendDailyWordOfTheDay(): Promise<void> {
    try {
      const tokenRows = await this.prisma.deviceToken.findMany({
        distinct: ['userId'],
        select: { userId: true },
      });

      if (!tokenRows.length) return;

      const todayStartUtc = new Date();
      todayStartUtc.setUTCHours(0, 0, 0, 0);
      const word = await this.wordOfDayService.getWordOfTheDay();
      const userIds = tokenRows.map((r) => r.userId);

      const alreadyNotifiedRows = await this.prisma.notificationLog.findMany({
        where: {
          userId: { in: userIds },
          type: 'word_of_day',
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
            'word_of_day',
            {
              word: word.word,
              definition: word.definition,
              example: word.example,
              partOfSpeech: word.partOfSpeech,
              source: word.source,
            },
            { skipDedupe: true },
          );
        }),
      );
    } catch (error) {
      this.logger.error(
        `[WordOfDayScheduler] Failed daily push dispatch: ${(error as Error).message}`,
      );
    }
  }
}
