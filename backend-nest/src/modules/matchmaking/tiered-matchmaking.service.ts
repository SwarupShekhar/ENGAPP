import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

interface MatchCriteria {
  cefrLevel: string;
  reliabilityMin: number;
  tierMin: string;
  interests?: string[];
}

@Injectable()
export class TieredMatchmakingService {
  private readonly logger = new Logger(TieredMatchmakingService.name);

  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {}

  async findMatch(userId: string, structure: string): Promise<{ partnerId: string; sessionId: string } | null> {
    // Resolve UUID first to ensure we use internal ID for DB lookups
    const dbUserId = await this.resolveToUuid(userId);
    if (!dbUserId) throw new NotFoundException('User not found');

    const user = await this.prisma.user.findUnique({
      where: { id: dbUserId },
      include: {
        reliability: true,
        points: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    // Build match criteria
    const criteria: MatchCriteria = {
      cefrLevel: user.overallLevel || 'B1',
      reliabilityMin: this.getMinReliabilityForUser(user.reliability?.reliabilityScore || 100),
      tierMin: user.reliability?.tier || 'bronze',
      interests: user.hobbies || [],
    };

    const startTime = Date.now();
    const TIMEOUT_MS = 45000; // 45 seconds total

    while (Date.now() - startTime < TIMEOUT_MS) {
        const elapsedTime = Date.now() - startTime;
        let mode: 'strict' | 'medium' | 'relaxed' = 'strict';

        if (elapsedTime > 15000) mode = 'medium'; // > 15s
        if (elapsedTime > 30000) mode = 'relaxed'; // > 30s

        const partnerId = await this.searchForMatch(dbUserId, structure, criteria, mode);
        
        if (partnerId) {
            // Match Found! Resolve partner UUID for safety (though search returns UUIDs usually)
            const dbPartnerId = await this.resolveToUuid(partnerId);
            
            if (dbUserId && dbPartnerId) {
                // Create Session
                const session = await this.prisma.conversationSession.create({
                    data: {
                        topic: structure, // Use structure as topic for now
                        status: 'CREATED',
                        participants: {
                            create: [
                                { userId: dbUserId },
                                { userId: dbPartnerId },
                            ],
                        },
                    },
                });

                // Cleanup queues
                await this.removeFromQueue(userId); // Use original ID for redis keys if they used Clerk ID
                await this.removeFromQueue(partnerId);

                return {
                    partnerId: partnerId,
                    sessionId: session.id,
                };
            }
        }

        // Wait 1s before next attempt
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Timeout -> AI Fallback (Controller handles null)
    return null;
  }

  private async searchForMatch(
    userId: string,
    structure: string,
    criteria: MatchCriteria,
    mode: 'strict' | 'medium' | 'relaxed'
  ): Promise<string | null> {
    // CEFR level matching (±1 level)
    const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const userLevelIndex = cefrLevels.indexOf(criteria.cefrLevel);
    const acceptableLevels = cefrLevels.slice(
      Math.max(0, userLevelIndex - 1),
      Math.min(cefrLevels.length, userLevelIndex + 2)
    );

    // 1. Fetch candidate IDs from Redis queues
    const candidateIds = new Set<string>();
    const redisClient = this.redisService.getClient();

    for (const level of acceptableLevels) {
        const queueKey = `queue:${level}`;
        const queuedUsers = await redisClient.lrange(queueKey, 0, -1);
        queuedUsers.forEach(id => {
            if (id !== userId) candidateIds.add(id);
        });
    }

    if (candidateIds.size === 0) return null;

    // 2. Fetch user details from DB
    const candidates = await this.prisma.user.findMany({
      where: {
        id: { in: Array.from(candidateIds) },
        reliability: {
          reliabilityScore: { gte: criteria.reliabilityMin },
        },
      },
      include: {
        reliability: true,
      },
    });

    if (candidates.length === 0) return null;

    // 3. Filter by Mode constraints
    let filteredCandidates = candidates;
    
    if (mode === 'strict') {
       filteredCandidates = candidates.filter(c => c.reliability?.tier === criteria.tierMin);
    } else if (mode === 'medium') {
        const tierRank: Record<string, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4 };
        const userTierRank = tierRank[criteria.tierMin] || 1;
        filteredCandidates = candidates.filter(c => {
             const cTier = c.reliability?.tier || 'bronze';
             return (tierRank[cTier] || 1) >= userTierRank - 1;
        });
    }

    if (filteredCandidates.length === 0) return null;

    // 4. Score and Rank
    const scored = filteredCandidates
      .map(u => ({
        userId: u.id,
        score: this.calculateMatchScore(u, criteria),
      }))
      .sort((a, b) => b.score - a.score);

    const bestMatchId = scored[0]?.userId || null;

    return bestMatchId;
  }

  private async removeFromQueue(userId: string) {
      // We need to know the level to remove efficiently, or search all.
      // Or check user meta.
      const meta = await this.redisService.getClient().hgetall(`user:${userId}:meta`);
      if (meta && meta.level) {
          await this.redisService.getClient().lrem(`queue:${meta.level}`, 0, userId);
          await this.redisService.getClient().del(`user:${userId}:meta`);
      }
  }

  private async resolveToUuid(id: string): Promise<string | null> {
        // 1. Check if it's already a valid UUID and exists
        const byId = await this.prisma.user.findUnique({ where: { id } });
        if (byId) return byId.id;

        // 2. Check if it's a Clerk ID
        const byClerkId = await this.prisma.user.findUnique({ where: { clerkId: id } });
        if (byClerkId) return byClerkId.id;

        return null;
  }

  private calculateMatchScore(candidate: any, criteria: MatchCriteria): number {
    let score = 0;

    // CEFR level exact match bonus
    if (candidate.overallLevel === criteria.cefrLevel) score += 30;
    else score += 10; // Within ±1

    // Reliability score similarity
    const reliabilityDiff = Math.abs(
      (candidate.reliability?.reliabilityScore || 100) - (criteria.reliabilityMin || 100)
    );
    score += Math.max(0, 20 - reliabilityDiff / 5); // Max 20 points

    // Tier match
    const tierRank: Record<string, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4 };
    const tierDiff = Math.abs(
      (tierRank[candidate.reliability?.tier as string] || 1) -
      (tierRank[criteria.tierMin] || 1)
    );
    score += Math.max(0, 15 - tierDiff * 5);

    // Interest overlap
    const sharedInterests = (candidate.hobbies || []).filter((h: string) =>
      criteria.interests?.includes(h)
    );
    score += sharedInterests.length * 5; // 5 points per shared interest

    return score;
  }

  private getMinReliabilityForUser(userReliability: number): number {
    // Users with high reliability should only match with similarly reliable users
    if (userReliability >= 90) return 80;
    if (userReliability >= 75) return 65;
    if (userReliability >= 60) return 50;
    return 40; // Minimum acceptable
  }
}
