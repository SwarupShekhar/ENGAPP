import { Global, Module } from '@nestjs/common';
import { PushyService } from './pushy.service';
import { NotificationService } from './notification.service';
import { SmartReminderScheduler } from './smart-reminder.scheduler';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PushyService, NotificationService, SmartReminderScheduler],
  exports: [NotificationService],
})
export class NotificationsModule {}
