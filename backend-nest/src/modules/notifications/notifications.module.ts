import { Global, Module } from '@nestjs/common';
import { PushyService } from './pushy.service';
import { NotificationService } from './notification.service';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PushyService, NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
