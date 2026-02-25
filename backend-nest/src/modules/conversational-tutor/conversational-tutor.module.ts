import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConversationalTutorService } from './conversational-tutor.service';
import { ConversationalTutorController } from './conversational-tutor.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { ReelsModule } from '../reels/reels.module';

@Module({
  imports: [HttpModule, PrismaModule, ReelsModule],
  controllers: [ConversationalTutorController],
  providers: [ConversationalTutorService],
  exports: [ConversationalTutorService],
})
export class ConversationalTutorModule {}
