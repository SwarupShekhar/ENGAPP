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
    const dbUserId = await this.resolveToUuid(userId);
    if (!dbUserId) {
      this.logger.error(
        `Failed to resolve user ${userId} to UUID for joinQueue`,
      );
      return { status: 'error', message: 'User not found' };
    }

    const queueKey = `queue:${level}`;
    const timestamp = Date.now();

    // Store user join time to handle timeouts later
    await this.redisService.getClient().hset(`user:${dbUserId}:meta`, {
      joinedAt: timestamp.toString(),
      level,
      topic,
      clerkId: userId, // Keep clerkId for reference if needed
    });

    // Ensure uniqueness in the queue by removing any existing entries for this user
    await this.redisService.getClient().lrem(queueKey, 0, dbUserId);
    await this.redisService.getClient().rpush(queueKey, dbUserId);

    this.logger.log(
      `User ${dbUserId} (Clerk: ${userId}) joined queue for level ${level} with topic ${topic}`,
    );
    return { status: 'queued' };
  }

  async leaveQueue(userId: string, level: string) {
    const dbUserId = await this.resolveToUuid(userId);
    if (!dbUserId) return { status: 'error' };

    const queueKey = `queue:${level}`;
    const redis = this.redisService.getClient();
    
    // Check if user was actually removed from the queue
    const removedCount = await redis.lrem(queueKey, 0, dbUserId);
    
    // Only delete meta if the user was actually in the queue
    if (removedCount > 0) {
      await redis.del(`user:${dbUserId}:meta`);
      this.logger.log(`User ${dbUserId} left queue for level ${level}`);
    } else {
      this.logger.log(`User ${dbUserId} was not in queue for level ${level}, skipping meta deletion`);
    }

    return { status: 'left' };
  }

  async checkMatch(userId: string, level: string) {
    const dbUserId = await this.resolveToUuid(userId);
    if (!dbUserId) {
      return { matched: false };
    }

    const userMeta = await this.redisService
      .getClient()
      .hgetall(`user:${dbUserId}:meta`);

    // 1) Check if a match was already found by the partner
    if (userMeta && userMeta.matchResult) {
      const result = JSON.parse(userMeta.matchResult);
      await this.redisService.getClient().del(`user:${dbUserId}:meta`);
      this.logger.log(
        `User ${dbUserId} retrieved stored match result: ${result.sessionId}`,
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
        await this.redisService.getClient().lrem(`queue:${level}`, 0, dbUserId);
        await this.redisService.getClient().del(`user:${dbUserId}:meta`);
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
      if (queue.includes(dbUserId)) {
        // Find blocked users
        const blocks = await this.prisma.blockedUser.findMany({
          where: {
            OR: [{ blockerId: dbUserId }, { blockedUserId: dbUserId }],
          },
          select: { blockerId: true, blockedUserId: true },
        });

        const blockedIds = new Set([
          ...blocks.map((b) => b.blockerId),
          ...blocks.map((b) => b.blockedUserId),
        ]);

        // Find a partner who isn't blocked AND is currently online
        let partnerId: string | null = null;
        for (const potentialPartnerId of queue) {
          if (potentialPartnerId === dbUserId) continue;

          if (!blockedIds.has(potentialPartnerId)) {
            // potentialPartnerId in queue IS already a UUID now
            // Check if partner is actually online right now via Redis
            const isOnline = await this.redisService
              .getClient()
              .get(`online:${potentialPartnerId}`);
            if (!isOnline) {
              // User is offline, remove them from queue to prevent ghost matching
              this.logger.log(
                `Potential partner ${potentialPartnerId} is offline. Removing from queue.`,
              );
              await this.redisService
                .getClient()
                .lrem(queueKey, 0, potentialPartnerId);
              await this.redisService
                .getClient()
                .del(`user:${potentialPartnerId}:meta`);
              continue;
            }

            partnerId = potentialPartnerId;
            break;
          }
        }

        if (partnerId) {
          // Both are UUIDs. Pop them to avoid race conditions.
          const removedU1 = await this.redisService
            .getClient()
            .lrem(queueKey, 1, dbUserId);
          const removedU2 = await this.redisService
            .getClient()
            .lrem(queueKey, 1, partnerId);

          if (removedU1 > 0 && removedU2 > 0) {
            this.logger.log(
              `Match found between ${dbUserId} and ${partnerId} for level ${level}`,
            );

            // They are already UUIDs here.
            const dbUserIdVal = dbUserId;
            const dbPartnerId = partnerId;

            const session = await this.prisma.conversationSession.create({
              data: {
                topic: userMeta.topic || 'general',
                status: 'CREATED',
                participants: {
                  create: [{ userId: dbUserIdVal }, { userId: dbPartnerId }],
                },
              },
            });

            const currentUser = await this.prisma.user.findUnique({
              where: { id: dbUserIdVal },
              select: { fname: true, lname: true },
            });

            const partnerUser = await this.prisma.user.findUnique({
              where: { id: dbPartnerId },
              select: { fname: true, lname: true },
            });

            const matchResultForInitiator = {
              sessionId: session.id,
              roomName: `room_${session.id}`,
              partnerId: dbPartnerId,
              partnerName: partnerUser
                ? `${partnerUser.fname} ${partnerUser.lname}`
                : 'Co-learner',
            };

            const matchResultForPartner = {
              sessionId: session.id,
              roomName: `room_${session.id}`,
              partnerId: dbUserIdVal,
              partnerName: currentUser
                ? `${currentUser.fname} ${currentUser.lname}`
                : 'Co-learner',
            };

            // Store for partner to pick up
            await this.redisService
              .getClient()
              .hset(`user:${dbPartnerId}:meta`, {
                matchResult: JSON.stringify(matchResultForPartner),
              });

            // Clear initiator's meta (returning directly)
            await this.redisService.getClient().del(`user:${dbUserIdVal}:meta`);

            return {
              matched: true,
              ...matchResultForInitiator,
            };
          } else {
            // If one was już popped by another concurrently, return them to queue
            if (removedU1 > 0)
              await this.redisService.getClient().rpush(queueKey, dbUserId);
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
