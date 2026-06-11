import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';
import { NotificationService } from './notification.service';
import { NotificationStatus } from '@prisma/client';

@Injectable()
export class SmartReminderScheduler {
  private readonly logger = new Logger(SmartReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron('0 * * * *')
  async sendReminders(): Promise<void> {
    const currentHour = new Date().getUTCHours();

    const tokenRows = await this.prisma.deviceToken.findMany({
      distinct: ['userId'],
      select: { userId: true },
    });

    await Promise.all(tokenRows.map((row) => this.processUser(row.userId, currentHour)));
  }

  private async processUser(userId: string, currentHour: number): Promise<void> {
    try {
      const userPrefs = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { practiceRemindersEnabled: true, currentStreak: true },
      });
      if (!userPrefs?.practiceRemindersEnabled) return;

      const practiceHour = await this.getPracticeHour(userId);
      const diff = Math.abs(currentHour - practiceHour);
      const withinWindow = diff <= 1 || diff >= 23; // handles midnight wrap (e.g. 23 vs 0)
      if (!withinWindow) return;

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const practicedToday = await this.prisma.sessionParticipant.findFirst({
        where: {
          userId,
          session: { createdAt: { gte: today } },
        },
      });
      if (practicedToday) return;

      const alreadyNotified = await this.prisma.notificationLog.findFirst({
        where: {
          userId,
          type: { in: ['reminder', 'streak_risk'] },
          sentAt: { gte: today },
          status: { not: NotificationStatus.failed },
        },
      });
      if (alreadyNotified) return;

      const streak = userPrefs.currentStreak ?? 0;

      if (streak >= 3 && currentHour >= 22) {
        await this.notificationService.notify(userId, 'streak_risk', { streakDays: streak });
      } else {
        await this.notificationService.notify(userId, 'reminder', { streakDays: streak > 0 ? streak : undefined });
      }
    } catch (err) {
      this.logger.error(`[SmartReminder] Failed for user ${userId}: ${(err as Error).message}`);
    }
  }

  private async getPracticeHour(userId: string): Promise<number> {
    const DEFAULT_HOUR = 19;

    const sessions = await this.prisma.sessionParticipant.findMany({
      where: { userId },
      select: { session: { select: { createdAt: true } } },
      orderBy: { session: { createdAt: 'desc' } },
      take: 10,
    });

    if (sessions.length < 3) return DEFAULT_HOUR;

    const hourCounts = new Map<number, number>();
    for (const s of sessions) {
      const h = s.session.createdAt.getUTCHours();
      hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
    }

    let modeHour = DEFAULT_HOUR;
    let maxCount = 0;
    for (const [h, count] of hourCounts) {
      if (count > maxCount) {
        maxCount = count;
        modeHour = h;
      }
    }

    return modeHour;
  }
}
