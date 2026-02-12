import { Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingController } from './matchmaking.controller';
import { RedisModule } from '../../redis/redis.module';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
    imports: [RedisModule, PrismaModule],
    controllers: [MatchmakingController],
    providers: [MatchmakingService],
    exports: [MatchmakingService],
})
export class MatchmakingModule { }
