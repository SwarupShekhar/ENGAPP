import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { MuxService } from '../../integrations/mux.service';
import { WeaknessService } from './weakness.service';

@Injectable()
export class ReelsService {
  private readonly logger = new Logger(ReelsService.name);
  private readonly strapiBaseUrl: string;
  private readonly strapiToken: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly muxService: MuxService,
    private readonly weaknessService: WeaknessService,
  ) {
    this.strapiBaseUrl = this.configService.get<string>('STRAPI_BASE_URL');
    this.strapiToken = this.configService.get<string>('STRAPI_API_KEY');
  }

  /**
   * Main engine for the eBites feed — Smart English Coach.
   *
   * Algorithm:
   *  1. Get user weaknesses (with time decay applied)
   *  2. Get user's watch history (to avoid repeats)
   *  3. Fetch reels from Strapi in three buckets:
   *     - Weakness reels (50%): match target_sounds / target_mistakes / topic tags
   *     - Featured reels (20%): editorially curated
   *     - General reels (30%): everything else
   *  4. Deduplicate against watch history
   *  5. Sort by relevance score (weakness match strength + editorial boost)
   *  6. Return mixed feed
   */
  async getFeed(userId: string, cursor?: number) {
    try {
      // 1. Fetch user profile for difficulty filtering
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { level: true, nativeLang: true },
      });
      const difficulty = this.mapUserLevelToDifficulty(user?.level || 'A1');

      // 2. Fetch user's weaknesses (with decay applied)
      const weaknesses = await this.weaknessService.getTopWeaknesses(
        userId,
        10,
      );
      const weakTags = weaknesses.map((w) => w.topicTag);
      const weaknessMap = new Map(
        weaknesses.map((w) => [w.topicTag, w.effectiveScore]),
      );

      this.logger.debug(
        `Fetching feed for user ${userId} (${difficulty}). Weaknesses: ${weakTags.join(', ')}`,
      );

      // 3. Get watch history to filter out already-seen reels
      const watchHistory = await this.prisma.userReelHistory.findMany({
        where: { userId, completed: true },
        select: { strapiReelId: true },
      });
      const watchedIds = new Set(watchHistory.map((h) => h.strapiReelId));

      // 4. Fetch reels from Strapi in parallel
      const [weakReels, featuredReels, generalReels] = await Promise.all([
        weakTags.length > 0
          ? this.fetchReelsFromStrapi(weakTags, 20, difficulty)
          : Promise.resolve([]),
        this.fetchFeaturedReels(5),
        this.fetchReelsFromStrapi([], 15, difficulty),
      ]);

      // 5. Score and rank all reels
      const allReels = new Map<number, any>(); // Deduplicate by reel ID

      // Process weakness reels (highest priority)
      for (const reel of weakReels) {
        const id = reel.id;
        if (watchedIds.has(id)) continue;
        const attr = reel.attributes || reel;
        const relevanceScore = this.calculateRelevanceScore(
          attr,
          weaknessMap,
          'weakness',
        );
        allReels.set(id, { ...reel, _relevanceScore: relevanceScore });
      }

      // Process featured reels
      for (const reel of featuredReels) {
        const id = reel.id;
        if (watchedIds.has(id) || allReels.has(id)) continue;
        const attr = reel.attributes || reel;
        const relevanceScore = this.calculateRelevanceScore(
          attr,
          weaknessMap,
          'featured',
        );
        allReels.set(id, { ...reel, _relevanceScore: relevanceScore });
      }

      // Process general reels
      for (const reel of generalReels) {
        const id = reel.id;
        if (watchedIds.has(id) || allReels.has(id)) continue;
        const attr = reel.attributes || reel;
        const relevanceScore = this.calculateRelevanceScore(
          attr,
          weaknessMap,
          'general',
        );
        allReels.set(id, { ...reel, _relevanceScore: relevanceScore });
      }

      // 6. Sort by relevance score and apply the 50/20/30 mix
      const sortedReels = Array.from(allReels.values()).sort(
        (a, b) => b._relevanceScore - a._relevanceScore,
      );

      // Apply pagination cursor
      const pageSize = 10;
      const startIndex = cursor || 0;
      const pagedReels = sortedReels.slice(startIndex, startIndex + pageSize);

      // 7. Format for client
      return {
        items: pagedReels.map((reel) => this.formatReelForClient(reel)),
        nextCursor:
          startIndex + pageSize < sortedReels.length
            ? startIndex + pageSize
            : null,
        totalAvailable: sortedReels.length,
      };
    } catch (error) {
      this.logger.error(`Failed to generate reels feed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculates a relevance score for ranking reels in the feed.
   * Higher score = shown earlier.
   */
  private calculateRelevanceScore(
    reelAttributes: any,
    weaknessMap: Map<string, number>,
    bucket: 'weakness' | 'featured' | 'general',
  ): number {
    let score = 0;

    // Base score by bucket type
    if (bucket === 'weakness') score += 100;
    else if (bucket === 'featured') score += 50;
    else score += 20;

    // Match target_sounds against user weaknesses
    const targetSounds: string[] = reelAttributes.target_sounds || [];
    for (const sound of targetSounds) {
      const weakScore = weaknessMap.get(sound);
      if (weakScore) {
        score += weakScore * 0.5; // Up to +50 points per matched sound
      }
    }

    // Match target_mistakes against user weaknesses
    const targetMistakes: string[] = reelAttributes.target_mistakes || [];
    for (const mistake of targetMistakes) {
      const weakScore = weaknessMap.get(mistake);
      if (weakScore) {
        score += weakScore * 0.5;
      }
    }

    // Match topic tags against weaknesses
    const topicSlug =
      reelAttributes.topics?.[0]?.slug ||
      reelAttributes.topics?.data?.[0]?.attributes?.slug;
    if (topicSlug && weaknessMap.has(topicSlug)) {
      score += weaknessMap.get(topicSlug) * 0.3;
    }

    // Editorial priority boost
    const priorityWeight = reelAttributes.priority_weight || 0;
    score += priorityWeight * 2;

    // Small randomization to avoid staleness (±10%)
    score *= 0.9 + Math.random() * 0.2;

    return score;
  }

  /**
   * Format a Strapi reel object for the mobile client.
   */
  private formatReelForClient(reel: any) {
    const attributes = reel.attributes || reel;
    return {
      id: reel.id,
      title: attributes.title,
      playback_url: `https://stream.mux.com/${attributes.mux_playback_id}.m3u8`,
      topic_tag:
        attributes.topics?.[0]?.slug ||
        attributes.topics?.data?.[0]?.attributes?.slug ||
        attributes.topic_tags?.[0] ||
        'general',
      target_sounds: attributes.target_sounds || [],
      target_mistakes: attributes.target_mistakes || [],
      is_featured: attributes.is_featured || false,
      activity: this.formatActivity(
        attributes.question?.data || attributes.question,
      ),
    };
  }

  /**
   * Fetch reels from Strapi filtered by topic tags and difficulty.
   */
  private async fetchReelsFromStrapi(
    tags: string[],
    limit: number,
    difficulty?: string,
  ) {
    let url = `${this.strapiBaseUrl}/api/reels?populate=*&pagination[limit]=${limit}`;

    if (tags.length > 0) {
      tags.forEach((tag, index) => {
        url += `&filters[topics][slug][$in][${index}]=${tag}`;
      });
    }

    // Temporarily disable strict difficulty filtering to ensure the feed
    // always has content, regardless of the user's level or current DB size.
    // if (difficulty) {
    //   url += `&filters[difficulty_level][$eq]=${difficulty}`;
    // }

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { Authorization: `Bearer ${this.strapiToken}` },
          timeout: 60000, // 60s timeout for Render free-tier cold starts
        }),
      );
      return response.data.data || [];
    } catch (error) {
      this.logger.error(`Strapi request failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch editorially featured reels.
   */
  private async fetchFeaturedReels(limit: number) {
    const url = `${this.strapiBaseUrl}/api/reels?populate=*&pagination[limit]=${limit}&filters[is_featured][$eq]=true`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { Authorization: `Bearer ${this.strapiToken}` },
          timeout: 60000,
        }),
      );
      return response.data.data || [];
    } catch (error) {
      this.logger.error(`Strapi featured request failed: ${error.message}`);
      return [];
    }
  }

  private formatActivity(activityData: any) {
    if (!activityData) return null;

    const attr = activityData.attributes || activityData;

    // Construct options array
    const options = [
      attr.option_a,
      attr.option_b,
      attr.option_c,
      attr.option_d,
    ].filter(Boolean);

    // Map A,B,C,D to the actual text
    let correctAnswer = attr.correct_answer;
    if (attr.correct_answer === 'A') correctAnswer = attr.option_a;
    else if (attr.correct_answer === 'B') correctAnswer = attr.option_b;
    else if (attr.correct_answer === 'C') correctAnswer = attr.option_c;
    else if (attr.correct_answer === 'D') correctAnswer = attr.option_d;

    return {
      type: attr.type || 'mcq',
      question: attr.question_text,
      options: options,
      correct_answer: correctAnswer,
      explanation: attr.explaination, // Strapi typo
      topic_tag: attr.topic_tag,
    };
  }

  /**
   * Submits activity result and updates the user's weakness score.
   * Correct answer reduces the score (improves), wrong answer increases it.
   */
  async submitActivityResult(
    userId: string,
    reelId: string,
    isCorrect: boolean,
    topicTag: string,
  ) {
    this.logger.debug(
      `User ${userId} submitted ${isCorrect ? 'CORRECT' : 'WRONG'} for topic ${topicTag}`,
    );

    // Update weakness score via the centralized ingestion pipeline
    const delta = isCorrect ? -5 : 5;
    await this.weaknessService.ingestWeakness(
      userId,
      topicTag,
      'activity',
      delta,
    );

    // Get the updated score for the response
    const updatedScore = await this.prisma.userTopicScore.findUnique({
      where: { userId_topicTag: { userId, topicTag } },
    });

    return { success: true, newScore: updatedScore?.score || 50 };
  }

  /**
   * Record that a user watched a reel.
   * Called from the mobile client when a reel is viewed.
   */
  async recordReelWatch(
    userId: string,
    strapiReelId: number,
    completed: boolean,
  ) {
    await this.prisma.userReelHistory.upsert({
      where: { userId_strapiReelId: { userId, strapiReelId } },
      update: {
        watchedAt: new Date(),
        completed: completed,
      },
      create: {
        userId,
        strapiReelId,
        completed,
      },
    });
  }

  private mapUserLevelToDifficulty(level: string): string {
    if (!level) return 'easy';
    const l = level.toLowerCase();

    if (l.includes('beginner') || l.includes('a1') || l.includes('a2'))
      return 'easy';
    if (l.includes('intermediate') || l.includes('b1') || l.includes('b2'))
      return 'medium';
    if (
      l.includes('advanced') ||
      l.includes('expert') ||
      l.includes('c1') ||
      l.includes('c2')
    )
      return 'hard';

    if (l.startsWith('a')) return 'easy';
    if (l.startsWith('b')) return 'medium';
    return 'hard';
  }
}
