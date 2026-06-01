import { Module } from '@nestjs/common';
import { InCallCoachingController } from './in-call-coaching.controller';
import { InCallCoachingService } from './in-call-coaching.service';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { HomeModule } from '../home/home.module';

@Module({
  imports: [PrismaModule, RedisModule, HomeModule],
  controllers: [InCallCoachingController],
  providers: [InCallCoachingService],
  exports: [InCallCoachingService],
})
export class InCallCoachingModule {}
