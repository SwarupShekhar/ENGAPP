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
   * Main engine for the eBites feed.
   * Combines user-specific weakness reels (60%) with general interest reels (40%).
   */
  async getFeed(userId: string) {
    try {
      // 1. Fetch user level for difficulty filtering
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { level: true },
      });
      const difficulty = this.mapUserLevelToDifficulty(user?.level || 'A1');

      // 2. Fetch top 5 weaknesses for the user
      const weakTags = await this.weaknessService.getTopWeaknesses(userId);
      this.logger.debug(
        `Fetching feed for user ${userId} (${difficulty}). Weaknesses: ${weakTags.join(', ')}`,
      );

      // 3. Query Strapi for Reels
      const [weakReels, generalReels] = await Promise.all([
        this.fetchReelsFromStrapi(weakTags, 15, difficulty), // Personalized + Appropriate challenge
        this.fetchReelsFromStrapi([], 10, difficulty), // General + Appropriate challenge
      ]);

      // 4. Mix the reels (60% weakness, 40% general)
      const mixedReels = this.mixReels(weakReels, generalReels, 10);

      // 4. Process each reel: Sign Mux URL and format activity
      return mixedReels.map((reel) => {
        const attributes = reel.attributes || reel; // Handle different Strapi response formats
        return {
          id: reel.id,
          title: attributes.title,
          // Temporarily serving the raw public URL to rule out Mux signature issues
          playback_url: `https://stream.mux.com/${attributes.mux_playback_id}.m3u8`,
          topic_tag:
            attributes.topics?.[0]?.slug || // Strapi v5
            attributes.topics?.data?.[0]?.attributes?.slug || // Strapi v4
            attributes.topic_tags?.[0] ||
            'general',
          activity: this.formatActivity(
            attributes.question?.data || attributes.question,
          ),
        };
      });
    } catch (error) {
      this.logger.error(`Failed to generate reels feed: ${error.message}`);
      throw error;
    }
  }

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
      // Because we enabled Public access in Strapi, sending an invalid API key
      // actually overrides Public access and forces a 401 Unauthorized error.
      // Therefore, we drop the Authorization header to rely entirely on the Public role.
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data.data || [];
    } catch (error) {
      this.logger.error(`Strapi request failed: ${error.message}`);
      return [];
    }
  }

  private mixReels(weak: any[], general: any[], targetCount: number) {
    const result = [];
    const weakCount = Math.floor(targetCount * 0.6);
    const generalCount = targetCount - weakCount;

    // Take from weak set first
    result.push(...weak.slice(0, weakCount));

    // Take remaining from general set (avoiding duplicates if possible)
    const weakIds = new Set(result.map((r) => r.id));
    const uniqueGeneral = general.filter((r) => !weakIds.has(r.id));

    result.push(...uniqueGeneral.slice(0, generalCount));

    // Shuffle slightly for variety
    return result.sort(() => Math.random() - 0.5);
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

    // Update weakness score (UserTopicScore table)
    // High score = High weakness.
    // Correct -> score - 5, Wrong -> score + 5.
    const delta = isCorrect ? -5 : 5;

    const currentScore = await this.prisma.userTopicScore.findUnique({
      where: { userId_topicTag: { userId, topicTag } },
    });

    const newScore = Math.max(
      0,
      Math.min(100, (currentScore?.score || 50) + delta),
    );

    await this.prisma.userTopicScore.upsert({
      where: { userId_topicTag: { userId, topicTag } },
      update: { score: newScore },
      create: { userId, topicTag, score: newScore },
    });

    return { success: true, newScore };
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
