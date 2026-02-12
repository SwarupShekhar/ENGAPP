import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class MatchmakingService {
    private readonly logger = new Logger(MatchmakingService.name);
    private readonly TIMEOUT_SECONDS = 60;

    constructor(
        private redisService: RedisService,
        private prisma: PrismaService,
    ) { }

    async joinQueue(userId: string, level: string, topic: string = 'general') {
        const queueKey = `queue:${level}`;
        const timestamp = Date.now();

        // Store user join time to handle timeouts later
        await this.redisService.getClient().hset(`user:${userId}:meta`, {
            joinedAt: timestamp.toString(),
            level,
            topic,
        });

        await this.redisService.getClient().rpush(queueKey, userId);
        this.logger.log(`User ${userId} joined queue for level ${level} with topic ${topic}`);
        return { status: 'queued' };
    }

    async checkMatch(userId: string, level: string) {
        // 1) Handle Timeout Check
        const userMeta = await this.redisService.getClient().hgetall(`user:${userId}:meta`);
        if (userMeta && userMeta.joinedAt) {
            const waitTime = (Date.now() - parseInt(userMeta.joinedAt)) / 1000;
            if (waitTime > this.TIMEOUT_SECONDS) {
                // Remove from queue
                await this.redisService.getClient().lrem(`queue:${level}`, 0, userId);
                await this.redisService.getClient().del(`user:${userId}:meta`);
                return {
                    matched: false,
                    message: 'No partner found yet. Try again?',
                };
            }
        }

        // 2) Normal Match Checking with Avoid-List
        const queueKey = `queue:${level}`;
        const queueLength = await this.redisService.getClient().llen(queueKey);

        if (queueLength >= 2) {
            const queue = await this.redisService.getClient().lrange(queueKey, 0, -1);
            if (queue.includes(userId)) {
                // Find blocks for this user
                const blocks = await this.prisma.blockedUser.findMany({
                    where: {
                        OR: [
                            { blockerId: userId },
                            { blockedUserId: userId }
                        ]
                    },
                    select: { blockerId: true, blockedUserId: true }
                });

                const blockedIds = new Set([
                    ...blocks.map(b => b.blockerId),
                    ...blocks.map(b => b.blockedUserId)
                ]);

                // Find a partner who isn't blocked
                let partnerId: string | null = null;
                for (const potentialPartner of queue) {
                    if (potentialPartner === userId) continue;
                    if (!blockedIds.has(potentialPartner)) {
                        partnerId = potentialPartner;
                        break;
                    }
                }

                if (partnerId) {
                    // Specific user pops to avoid race conditions with lpop
                    // Actually Redis doesn't have "pop specific", but we can use lrem u1 and lrem u2
                    const removedU1 = await this.redisService.getClient().lrem(queueKey, 1, userId);
                    const removedU2 = await this.redisService.getClient().lrem(queueKey, 1, partnerId);

                    if (removedU1 > 0 && removedU2 > 0) {
                        this.logger.log(`Match found between ${userId} and ${partnerId} for level ${level}`);

                        const session = await this.prisma.conversationSession.create({
                            data: {
                                topic: userMeta.topic || 'general',
                                status: 'CREATED',
                                participants: {
                                    create: [
                                        { userId: userId },
                                        { userId: partnerId },
                                    ],
                                },
                            },
                        });

                        await this.redisService.getClient().del(`user:${userId}:meta`);
                        await this.redisService.getClient().del(`user:${partnerId}:meta`);

                        return {
                            matched: true,
                            sessionId: session.id,
                            roomName: `room_${session.id}`,
                            partnerId: partnerId,
                        };
                    } else {
                        // If one failed to remove, put the other back (unlikely but safe)
                        if (removedU1 > 0) await this.redisService.getClient().rpush(queueKey, userId);
                        if (removedU2 > 0) await this.redisService.getClient().rpush(queueKey, partnerId);
                        return { matched: false };
                    }
                }
            }
        }

        return { matched: false };
    }
}
