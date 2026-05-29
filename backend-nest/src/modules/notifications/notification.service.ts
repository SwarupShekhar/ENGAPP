import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PushyService, PushPayload } from './pushy.service';
import { NotificationStatus } from '@prisma/client';
import { RedisService } from '../../redis/redis.service';
import { PosthogAnalyticsService } from './posthog-analytics.service';

export type NotificationType =
  | 'reminder'
  | 'streak_risk'
  | 'message'
  | 'match'
  | 'session_ready'
  | 'milestone'
  | 'friend_request'
  | 'incoming_call'
  | 'missed_call'
  | 'word_of_day';

export interface NotificationJobData {
  logId: string;
  userId: string;
  type: NotificationType;
  data: Record<string, unknown>;
}

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
  message: (d) => {
    const senderName = String(d.senderName ?? 'Someone');
    const preview = String(d.preview ?? '').trim();
    const title = preview ? `${senderName}: ${preview}` : `${senderName} sent you a message`;
    const body = preview || 'Open chat to read it.';
    return {
      title: title.length > 120 ? `${title.slice(0, 117)}…` : title,
      body,
      data: {
        type: 'message',
        conversationId: d.conversationId,
        messageId: d.messageId,
        senderName,
        preview,
        title,
        body,
        message: body,
      },
    };
  },
  friend_request: (d) => ({
    title: `${d.senderName ?? 'Someone'} sent a friend request`,
    body: 'Tap to view and respond.',
    data: {
      type: 'friend_request',
      requestId: d.requestId,
      senderId: d.senderId,
    },
  }),
  incoming_call: (d) => ({
    title: `${d.callerName ?? 'Someone'} is calling you`,
    body: 'Tap to open the app and join.',
    data: {
      type: 'incoming_call',
      conversationId: d.conversationId,
      callType: d.callType,
      callerId: d.callerId,
      callerName: d.callerName,
    },
  }),
  missed_call: (d) => ({
    title: `Missed call from ${d.callerName ?? 'your friend'}`,
    body: 'Tap to call back.',
    data: {
      type: 'missed_call',
      conversationId: d.conversationId,
      callerId: d.callerId,
      callerName: d.callerName,
    },
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
  word_of_day: (d) => ({
    title: `Word of the Day: ${String(d.word ?? 'New word')}`,
    body: String(d.definition ?? 'Tap to practice this word today.'),
    data: {
      type: 'word_of_day',
      word: d.word,
      definition: d.definition,
      example: d.example,
      partOfSpeech: d.partOfSpeech,
    },
  }),
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private static readonly JOB_NAME = 'deliver';

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushy: PushyService,
    private readonly redis: RedisService,
    private readonly posthog: PosthogAnalyticsService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  async notify(
    userId: string,
    type: NotificationType,
    data: Record<string, unknown>,
    options?: { skipDedupe?: boolean; deliverNow?: boolean },
  ): Promise<void> {
    if (!options?.skipDedupe) {
      const dedupeKey = this.buildDedupeKey(userId, type, data);
      const dedupeSet = await this.redis
        .getClient()
        .set(dedupeKey, '1', 'EX', this.dedupeWindowSeconds(type), 'NX');
      if (!dedupeSet) {
        this.logger.debug(`[Notification] deduped ${type} for user ${userId}`);
        return;
      }
    }

    const log = await this.prisma.notificationLog.create({
      data: {
        userId,
        type,
        payload: {
          ...data,
          queuedAt: new Date().toISOString(),
        } as unknown as import('@prisma/client').Prisma.InputJsonValue,
        status: NotificationStatus.retrying,
        attempts: 1,
      },
    });

    const jobData = { logId: log.id, userId, type, data } satisfies NotificationJobData;

    try {
      if (
        options?.deliverNow ||
        type === 'message' ||
        type === 'incoming_call' ||
        type === 'missed_call'
      ) {
        await this.processDelivery(jobData);
        return;
      }

      await this.notificationsQueue.add(NotificationService.JOB_NAME, jobData, {
        priority: this.priorityForType(type),
        attempts: this.maxAttemptsForType(type),
        backoff: {
          type: 'exponential',
          delay: this.backoffDelayMs(type),
        },
        removeOnComplete: 200,
        removeOnFail: 500,
        jobId: `${log.id}:${type}`,
      });
    } catch (err) {
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: NotificationStatus.failed },
      });
      this.logger.error(`[Notification] Failed for user ${userId} type ${type}: ${(err as Error).message}`);
    }
  }

  hasPushConfiguration(): boolean {
    return this.pushy.hasValidConfig();
  }

  async notifyMany(userIds: string[], type: NotificationType, data: Record<string, unknown>): Promise<void> {
    await Promise.all(userIds.map((id) => this.notify(id, type, data)));
  }

  async processDelivery(jobData: NotificationJobData): Promise<void> {
    const startedAt = Date.now();
    const { logId, userId, type, data } = jobData;
    const tokens = await this.prisma.deviceToken.findMany({ where: { userId } });
    if (!tokens.length) {
      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: {
          status: NotificationStatus.failed,
          attempts: { increment: 1 },
        },
      });
      return;
    }

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

      const successful = results.filter((r) => r.success).length;
      const failed = results.length - successful;
      const telemetry = {
        ...data,
        delivery: {
          successful,
          failed,
          latencyMs: Date.now() - startedAt,
          deliveredAt: new Date().toISOString(),
        },
      };

      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: {
          status: successful > 0 ? NotificationStatus.sent : NotificationStatus.failed,
          attempts: { increment: 1 },
          payload: telemetry as unknown as import('@prisma/client').Prisma.InputJsonValue,
        },
      });

      if (type === 'word_of_day' && successful > 0) {
        this.posthog.capture('word_of_day_push_sent', userId, {
          word: data.word,
          part_of_speech: data.partOfSpeech,
          word_source: data.source,
          devices_targeted: tokens.length,
          devices_delivered: successful,
        });
      }
    } catch (err) {
      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: {
          status: NotificationStatus.failed,
          attempts: { increment: 1 },
        },
      });
      throw err;
    }
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
        const raw = log.payload as Record<string, unknown>;
        const { delivery: _delivery, queuedAt: _queuedAt, ...payload } = raw;
        await this.processDelivery({
          logId: log.id,
          userId: log.userId,
          type: log.type as NotificationType,
          data: payload,
        });
      } catch (err) {
        this.logger.error(`[Notification] Retry failed for log ${log.id}: ${(err as Error).message}`);
      }
    }
  }

  private priorityForType(type: NotificationType): number {
    if (type === 'incoming_call' || type === 'missed_call' || type === 'message') return 1;
    if (type === 'friend_request') return 2;
    if (type === 'match' || type === 'session_ready') return 3;
    return 5;
  }

  private maxAttemptsForType(type: NotificationType): number {
    return type === 'incoming_call' ? 2 : 4;
  }

  private backoffDelayMs(type: NotificationType): number {
    if (type === 'incoming_call' || type === 'message') return 1500;
    return 4000;
  }

  private dedupeWindowSeconds(type: NotificationType): number {
    if (type === 'incoming_call') return 10;
    if (type === 'message') return 2;
    if (type === 'friend_request') return 30;
    return 120;
  }

  private buildDedupeKey(
    userId: string,
    type: NotificationType,
    data: Record<string, unknown>,
  ): string {
    const entityId =
      type === 'message'
        ? String(data.messageId ?? data.conversationId ?? 'none')
        : String(
            data.conversationId ??
              data.requestId ??
              data.sessionId ??
              data.callerId ??
              data.callId ??
              'none',
          );
    return `notif:dedupe:${userId}:${type}:${entityId}`;
  }

  async diagnostics() {
    const [tokenCount, queueCounts, failures] = await Promise.all([
      this.prisma.deviceToken.count(),
      this.notificationsQueue.getJobCounts(),
      this.prisma.notificationLog.groupBy({
        by: ['type'],
        where: { status: NotificationStatus.failed },
        _count: { _all: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);

    return {
      pushConfigured: this.hasPushConfiguration(),
      tokenCount,
      queue: queueCounts,
      failedByType: failures.map((f) => ({ type: f.type, count: f._count._all })),
    };
  }
}
