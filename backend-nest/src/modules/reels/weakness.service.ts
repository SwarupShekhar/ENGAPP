import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class WeaknessService {
  private readonly logger = new Logger(WeaknessService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Retrieves the top N weak topic tags for a given user.
   * Applies time-based score decay so old weaknesses naturally fade.
   * Higher effective scores represent higher "weakness intensity".
   */
  async getTopWeaknesses(
    userId: string,
    limit: number = 5,
  ): Promise<{ topicTag: string; effectiveScore: number }[]> {
    const weaknesses = await this.prisma.userTopicScore.findMany({
      where: { userId },
      orderBy: { score: 'desc' },
      take: limit * 2, // Fetch extra to account for decay filtering
    });

    // Apply time-based decay: score * (decayRate ^ daysSinceLastSeen)
    const now = new Date();
    const decayed = weaknesses.map((w) => {
      const daysSinceLastSeen = Math.max(
        0,
        (now.getTime() - w.lastSeenAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      const effectiveScore = w.score * Math.pow(w.decayRate, daysSinceLastSeen);

      // Boost score slightly by occurrences (recurrent weaknesses matter more)
      const occurrenceBoost = Math.min(1.5, 1 + w.occurrences * 0.05);

      return {
        ...w,
        effectiveScore: effectiveScore * occurrenceBoost,
      };
    });

    // Sort by effective score and return top N
    return decayed
      .filter((w) => w.effectiveScore > 10) // Ignore near-zero weaknesses
      .sort((a, b) => b.effectiveScore - a.effectiveScore)
      .slice(0, limit)
      .map((w) => ({
        topicTag: w.topicTag,
        effectiveScore: w.effectiveScore,
      }));
  }

  /**
   * For backward compatibility: returns just the tag strings
   */
  async getTopWeaknessTags(
    userId: string,
    limit: number = 5,
  ): Promise<string[]> {
    const weaknesses = await this.getTopWeaknesses(userId, limit);
    return weaknesses.map((w) => w.topicTag);
  }

  /**
   * Ingest a weakness signal from any source.
   * If the weakness already exists, increase the score and occurrences.
   * If not, create it with the initial score.
   */
  async ingestWeakness(
    userId: string,
    topicTag: string,
    source: 'activity' | 'session' | 'assessment',
    scoreChange: number,
  ): Promise<void> {
    const existing = await this.prisma.userTopicScore.findUnique({
      where: { userId_topicTag: { userId, topicTag } },
    });

    if (existing) {
      const newScore = Math.max(0, Math.min(100, existing.score + scoreChange));
      await this.prisma.userTopicScore.update({
        where: { userId_topicTag: { userId, topicTag } },
        data: {
          score: newScore,
          source, // Update to latest source
          occurrences: { increment: 1 },
          lastSeenAt: new Date(),
        },
      });
    } else {
      // Create new weakness with initial score of 50 + change
      const initialScore = Math.max(0, Math.min(100, 50 + scoreChange));
      await this.prisma.userTopicScore.create({
        data: {
          userId,
          topicTag,
          score: initialScore,
          source,
          occurrences: 1,
          lastSeenAt: new Date(),
        },
      });
    }

    this.logger.debug(
      `Ingested weakness for user ${userId}: ${topicTag} (${source}, delta: ${scoreChange})`,
    );
  }

  /**
   * Batch ingest multiple weaknesses from a session analysis.
   * Called after a conversation session is analyzed.
   */
  async ingestFromSessionAnalysis(
    userId: string,
    mistakes: { type: string }[],
    pronunciationIssues: { issueType?: string; word?: string }[],
  ): Promise<void> {
    // Aggregate grammar mistakes by type
    const mistakeCounts = new Map<string, number>();
    for (const m of mistakes) {
      const tag = this.normalizeTag(m.type);
      mistakeCounts.set(tag, (mistakeCounts.get(tag) || 0) + 1);
    }

    // Aggregate pronunciation issues by type
    const pronCounts = new Map<string, number>();
    for (const p of pronunciationIssues) {
      if (p.issueType) {
        const tag = this.normalizeTag(p.issueType);
        pronCounts.set(tag, (pronCounts.get(tag) || 0) + 1);
      }
    }

    // Ingest all weakness signals
    const ingestions: Promise<void>[] = [];

    for (const [tag, count] of mistakeCounts) {
      // More occurrences = bigger score bump (capped at +20)
      const delta = Math.min(20, count * 5);
      ingestions.push(this.ingestWeakness(userId, tag, 'session', delta));
    }

    for (const [tag, count] of pronCounts) {
      const delta = Math.min(20, count * 5);
      ingestions.push(this.ingestWeakness(userId, tag, 'session', delta));
    }

    await Promise.all(ingestions);

    this.logger.log(
      `Ingested session analysis for user ${userId}: ${mistakeCounts.size} grammar + ${pronCounts.size} pronunciation weakness types`,
    );
  }

  /**
   * Normalize a tag to a consistent slug format.
   * e.g. "Verb Form" → "verb-form", "article_usage" → "article-usage"
   */
  private normalizeTag(raw: string): string {
    return raw
      .toLowerCase()
      .trim()
      .replace(/[_\s]+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }
}
