import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../database/prisma/prisma.service';
export declare class MatchmakingService {
    private redisService;
    private prisma;
    private readonly logger;
    private readonly TIMEOUT_SECONDS;
    constructor(redisService: RedisService, prisma: PrismaService);
    joinQueue(userId: string, level: string, topic?: string): Promise<{
        status: string;
    }>;
    checkMatch(userId: string, level: string): Promise<{
        matched: boolean;
        message: string;
        sessionId?: undefined;
        roomName?: undefined;
        partnerId?: undefined;
    } | {
        matched: boolean;
        sessionId: string;
        roomName: string;
        partnerId: string;
        message?: undefined;
    } | {
        matched: boolean;
        message?: undefined;
        sessionId?: undefined;
        roomName?: undefined;
        partnerId?: undefined;
    }>;
}
