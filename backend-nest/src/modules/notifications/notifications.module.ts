import { Global, Module } from '@nestjs/common';
import { PushyService } from './pushy.service';
import { NotificationService } from './notification.service';
import { SmartReminderScheduler } from './smart-reminder.scheduler';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { BullModule, InjectQueue } from '@nestjs/bull';
import type { Job, Queue } from 'bull';
import { Processor, Process } from '@nestjs/bull';
import { RedisModule } from '../../redis/redis.module';
import { HomeModule } from '../home/home.module';
import { WordOfDayScheduler } from './word-of-day.scheduler';
import { PosthogAnalyticsService } from './posthog-analytics.service';

@Processor('notifications')
class NotificationDeliveryProcessor {
  constructor(
    private readonly notifications: NotificationService,
    @InjectQueue('notifications') private readonly queue: Queue,
  ) {}

  @Process('deliver')
  async processDelivery(job: Job) {
    await this.notifications.processDelivery(job.data);
  }

  @Process('delivery-health-check')
  async processHealthCheck() {
    return { ok: true };
  }

  async queueDepth(): Promise<number> {
    const counts = await this.queue.getJobCounts();
    return (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
  }
}

@Global()
@Module({
  imports: [PrismaModule, RedisModule, HomeModule, BullModule.registerQueue({ name: 'notifications' })],
  providers: [
    PosthogAnalyticsService,
    PushyService,
    NotificationService,
    SmartReminderScheduler,
    WordOfDayScheduler,
    NotificationDeliveryProcessor,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
