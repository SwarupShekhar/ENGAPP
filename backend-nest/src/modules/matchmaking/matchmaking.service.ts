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
  ) {}

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
    this.logger.log(
      `User ${userId} joined queue for level ${level} with topic ${topic}`,
    );
    return { status: 'queued' };
  }

  async checkMatch(userId: string, level: string) {
    const userMeta = await this.redisService
      .getClient()
      .hgetall(`user:${userId}:meta`);

    // 1) Check if a match was already found by the partner
    if (userMeta && userMeta.matchResult) {
      const result = JSON.parse(userMeta.matchResult);
      await this.redisService.getClient().del(`user:${userId}:meta`);
      this.logger.log(
        `User ${userId} retrieved stored match result: ${result.sessionId}`,
      );
      return {
        matched: true,
        ...result,
      };
    }

    // 2) Handle Timeout Check
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

    // 3) Normal Match Checking
    const queueKey = `queue:${level}`;
    const queueLength = await this.redisService.getClient().llen(queueKey);

    if (queueLength >= 2) {
      const queue = await this.redisService.getClient().lrange(queueKey, 0, -1);
      if (queue.includes(userId)) {
        // Find blocked users
        const blocks = await this.prisma.blockedUser.findMany({
          where: {
            OR: [{ blockerId: userId }, { blockedUserId: userId }],
          },
          select: { blockerId: true, blockedUserId: true },
        });

        const blockedIds = new Set([
          ...blocks.map((b) => b.blockerId),
          ...blocks.map((b) => b.blockedUserId),
        ]);

        // Find a partner who isn't blocked AND is currently online
        let partnerId: string | null = null;
        for (const potentialPartner of queue) {
          if (potentialPartner === userId) continue;

          if (!blockedIds.has(potentialPartner)) {
            // Check if partner is actually online right now via Redis
            const isOnline = await this.redisService
              .getClient()
              .get(`online:${potentialPartner}`);
            if (!isOnline) {
              // User is offline, remove them from queue to prevent ghost matching
              this.logger.log(
                `Potential partner ${potentialPartner} is offline. Removing from queue.`,
              );
              await this.redisService
                .getClient()
                .lrem(queueKey, 0, potentialPartner);
              await this.redisService
                .getClient()
                .del(`user:${potentialPartner}:meta`);
              continue;
            }

            partnerId = potentialPartner;
            break;
          }
        }

        if (partnerId) {
          // Specific user pops to avoid race conditions
          const removedU1 = await this.redisService
            .getClient()
            .lrem(queueKey, 1, userId);
          const removedU2 = await this.redisService
            .getClient()
            .lrem(queueKey, 1, partnerId);

          if (removedU1 > 0 && removedU2 > 0) {
            this.logger.log(
              `Match found between ${userId} and ${partnerId} for level ${level}`,
            );

            const dbUserId = await this.resolveToUuid(userId);
            const dbPartnerId = await this.resolveToUuid(partnerId);

            if (!dbUserId || !dbPartnerId) {
              this.logger.error(
                `Failed to resolve users to UUIDs: ${userId}, ${partnerId}`,
              );
              await this.redisService.getClient().rpush(queueKey, userId);
              await this.redisService.getClient().rpush(queueKey, partnerId);
              return { matched: false };
            }

            const session = await this.prisma.conversationSession.create({
              data: {
                topic: userMeta.topic || 'general',
                status: 'CREATED',
                participants: {
                  create: [{ userId: dbUserId }, { userId: dbPartnerId }],
                },
              },
            });

            const currentUser = await this.prisma.user.findUnique({
              where: { id: dbUserId },
              select: { fname: true, lname: true },
            });

            const partnerUser = await this.prisma.user.findUnique({
              where: { id: dbPartnerId },
              select: { fname: true, lname: true },
            });

            const matchResultForInitiator = {
              sessionId: session.id,
              roomName: `room_${session.id}`,
              partnerId: partnerId,
              partnerName: partnerUser
                ? `${partnerUser.fname} ${partnerUser.lname}`
                : 'Co-learner',
            };

            const matchResultForPartner = {
              sessionId: session.id,
              roomName: `room_${session.id}`,
              partnerId: userId,
              partnerName: currentUser
                ? `${currentUser.fname} ${currentUser.lname}`
                : 'Co-learner',
            };

            // Store for partner to pick up
            await this.redisService.getClient().hset(`user:${partnerId}:meta`, {
              matchResult: JSON.stringify(matchResultForPartner),
            });

            // Clear initiator's meta (returning directly)
            await this.redisService.getClient().del(`user:${userId}:meta`);

            return {
              matched: true,
              ...matchResultForInitiator,
            };
          } else {
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

  private async resolveToUuid(id: string): Promise<string | null> {
    // 1. Check if it's already a valid UUID and exists
    const byId = await this.prisma.user.findUnique({ where: { id } });
    if (byId) return byId.id;

    // 2. Check if it's a Clerk ID
    const byClerkId = await this.prisma.user.findUnique({
      where: { clerkId: id },
    });
    if (byClerkId) return byClerkId.id;

    return null;
  }
}
