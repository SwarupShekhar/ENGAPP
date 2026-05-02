import { Global, Module } from '@nestjs/common';
import { PushyService } from './pushy.service';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PushyService],
  exports: [],
})
export class NotificationsModule {}
