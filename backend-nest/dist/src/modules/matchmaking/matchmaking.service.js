"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MatchmakingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchmakingService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../redis/redis.service");
const prisma_service_1 = require("../../database/prisma/prisma.service");
let MatchmakingService = MatchmakingService_1 = class MatchmakingService {
    constructor(redisService, prisma) {
        this.redisService = redisService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(MatchmakingService_1.name);
        this.TIMEOUT_SECONDS = 60;
    }
    async joinQueue(userId, level, topic = 'general') {
        const queueKey = `queue:${level}`;
        const timestamp = Date.now();
        await this.redisService.getClient().hset(`user:${userId}:meta`, {
            joinedAt: timestamp.toString(),
            level,
            topic,
        });
        await this.redisService.getClient().rpush(queueKey, userId);
        this.logger.log(`User ${userId} joined queue for level ${level} with topic ${topic}`);
        return { status: 'queued' };
    }
    async checkMatch(userId, level) {
        const userMeta = await this.redisService.getClient().hgetall(`user:${userId}:meta`);
        if (userMeta && userMeta.joinedAt) {
            const waitTime = (Date.now() - parseInt(userMeta.joinedAt)) / 1000;
            if (waitTime > this.TIMEOUT_SECONDS) {
                await this.redisService.getClient().lrem(`queue:${level}`, 0, userId);
                await this.redisService.getClient().del(`user:${userId}:meta`);
                return {
                    matched: false,
                    message: 'No partner found yet. Try again?',
                };
            }
        }
        const queueKey = `queue:${level}`;
        const queueLength = await this.redisService.getClient().llen(queueKey);
        if (queueLength >= 2) {
            const queue = await this.redisService.getClient().lrange(queueKey, 0, -1);
            if (queue.includes(userId)) {
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
                let partnerId = null;
                for (const potentialPartner of queue) {
                    if (potentialPartner === userId)
                        continue;
                    if (!blockedIds.has(potentialPartner)) {
                        partnerId = potentialPartner;
                        break;
                    }
                }
                if (partnerId) {
                    const removedU1 = await this.redisService.getClient().lrem(queueKey, 1, userId);
                    const removedU2 = await this.redisService.getClient().lrem(queueKey, 1, partnerId);
                    if (removedU1 > 0 && removedU2 > 0) {
                        this.logger.log(`Match found between ${userId} and ${partnerId} for level ${level}`);
                        const dbUserId = await this.resolveToUuid(userId);
                        const dbPartnerId = await this.resolveToUuid(partnerId);
                        if (!dbUserId || !dbPartnerId) {
                            this.logger.error(`Failed to resolve users to UUIDs: ${userId} -> ${dbUserId}, ${partnerId} -> ${dbPartnerId}`);
                            await this.redisService.getClient().rpush(queueKey, userId);
                            await this.redisService.getClient().rpush(queueKey, partnerId);
                            return { matched: false };
                        }
                        const session = await this.prisma.conversationSession.create({
                            data: {
                                topic: userMeta.topic || 'general',
                                status: 'CREATED',
                                participants: {
                                    create: [
                                        { userId: dbUserId },
                                        { userId: dbPartnerId },
                                    ],
                                },
                            },
                        });
                        const partner = await this.prisma.user.findUnique({
                            where: { id: partnerId },
                            select: { fname: true, lname: true }
                        });
                        await this.redisService.getClient().del(`user:${userId}:meta`);
                        await this.redisService.getClient().del(`user:${partnerId}:meta`);
                        return {
                            matched: true,
                            sessionId: session.id,
                            roomName: `room_${session.id}`,
                            partnerId: partnerId,
                            partnerName: partner ? `${partner.fname} ${partner.lname}` : 'Co-learner',
                        };
                    }
                    else {
                        if (removedU1 > 0)
                            await this.redisService.getClient().rpush(queueKey, userId);
                        if (removedU2 > 0)
                            await this.redisService.getClient().rpush(queueKey, partnerId);
                        return { matched: false };
                    }
                }
            }
        }
        return { matched: false };
    }
    async resolveToUuid(id) {
        const byId = await this.prisma.user.findUnique({ where: { id } });
        if (byId)
            return byId.id;
        const byClerkId = await this.prisma.user.findUnique({ where: { clerkId: id } });
        if (byClerkId)
            return byClerkId.id;
        return null;
    }
};
exports.MatchmakingService = MatchmakingService;
exports.MatchmakingService = MatchmakingService = MatchmakingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        prisma_service_1.PrismaService])
], MatchmakingService);
//# sourceMappingURL=matchmaking.service.js.map