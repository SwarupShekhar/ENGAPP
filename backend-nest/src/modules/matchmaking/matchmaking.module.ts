import { Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { TieredMatchmakingService } from './tiered-matchmaking.service';
import { MatchmakingController } from './matchmaking.controller';
import { RedisModule } from '../../redis/redis.module';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
    imports: [RedisModule, PrismaModule],
    controllers: [MatchmakingController],
    providers: [MatchmakingService, TieredMatchmakingService],
    exports: [MatchmakingService, TieredMatchmakingService],
})
export class MatchmakingModule { }
