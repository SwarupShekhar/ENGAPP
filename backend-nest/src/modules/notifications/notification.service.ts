import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PushyService, PushPayload } from './pushy.service';
import { NotificationStatus } from '@prisma/client';

export type NotificationType =
  | 'reminder'
  | 'streak_risk'
  | 'message'
  | 'match'
  | 'session_ready'
  | 'milestone';

const PAYLOADS: Record<NotificationType, (data: Record<string, unknown>) => PushPayload> = {
  reminder: (d) => ({
    title: 'Time to practice!',
    body: d.streakDays ? `Keep your ${d.streakDays}-day streak going 🔥` : "Your English won't improve itself!",
    data: { type: 'reminder' },
  }),
  streak_risk: (d) => ({
    title: 'Streak at risk!',
    body: `Practice now to keep your ${d.streakDays}-day streak alive ⚡`,
    data: { type: 'streak_risk' },
  }),
  message: (d) => ({
    title: `${d.senderName ?? 'New message'}`,
    body: String(d.preview ?? ''),
    data: { type: 'message', conversationId: d.conversationId },
  }),
  match: (d) => ({
    title: 'Partner found!',
    body: `${d.partnerName ?? 'Your partner'} is ready to practice 🎙️`,
    data: { type: 'match', sessionId: d.sessionId },
  }),
  session_ready: (d) => ({
    title: 'Session analysis ready',
    body: d.score != null ? `Your score: ${d.score} — tap to see your feedback` : 'Tap to see your session feedback',
    data: { type: 'session_ready', sessionId: d.sessionId },
  }),
  milestone: (d) => ({
    title: '🎉 Level up!',
    body: `You reached ${d.label ?? 'a new level'}!`,
    data: { type: 'milestone' },
  }),
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushy: PushyService,
  ) {}

  async notify(userId: string, type: NotificationType, data: Record<string, unknown>): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({ where: { userId } });
    if (!tokens.length) return;

    const log = await this.prisma.notificationLog.create({
      data: {
        userId,
        type,
        payload: data as unknown as import('@prisma/client').Prisma.InputJsonValue,
        status: NotificationStatus.sent,
        attempts: 1,
      },
    });

    try {
      const payload = PAYLOADS[type](data);
      const results = await this.pushy.send(
        tokens.map((t) => t.token),
        payload,
      );

      const invalidTokens = results.filter((r) => r.invalidToken).map((r) => r.token);
      if (invalidTokens.length) {
        await this.prisma.deviceToken.deleteMany({ where: { token: { in: invalidTokens } } });
      }
    } catch (err) {
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: NotificationStatus.failed },
      });
      this.logger.error(`[Notification] Failed for user ${userId} type ${type}: ${(err as Error).message}`);
    }
  }

  async notifyMany(userIds: string[], type: NotificationType, data: Record<string, unknown>): Promise<void> {
    await Promise.all(userIds.map((id) => this.notify(id, type, data)));
  }

  @Cron('0 */15 * * * *')
  async retryFailed(): Promise<void> {
    const failed = await this.prisma.notificationLog.findMany({
      where: { status: NotificationStatus.failed, attempts: { lt: 3 } },
      take: 50,
    });

    for (const log of failed) {
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: NotificationStatus.retrying },
      });
      try {
        await this.notify(log.userId, log.type as NotificationType, log.payload as Record<string, unknown>);
      } catch (err) {
        this.logger.error(`[Notification] Retry failed for log ${log.id}: ${(err as Error).message}`);
      }
    }
  }
}
