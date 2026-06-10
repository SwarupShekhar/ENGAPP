import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { ChatModule } from '../chat/chat.module';
import { ReelsModule } from '../reels/reels.module';
import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';

@Module({
  imports: [PrismaModule, ChatModule, ReelsModule],
  controllers: [EngagementController],
  providers: [EngagementService],
  exports: [EngagementService],
})
export class EngagementModule {}
