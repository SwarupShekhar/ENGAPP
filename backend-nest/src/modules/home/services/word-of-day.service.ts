import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import { DailyTtsService } from './daily-tts.service';
import { WordOfTheDay } from '../types/daily-content.types';
import { getConversationalWordForDay } from '../data/conversational-words';

export type { WordOfTheDay } from '../types/daily-content.types';

@Injectable()
export class WordOfDayService {
  private readonly logger = new Logger(WordOfDayService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly dailyTts: DailyTtsService,
  ) {}

  async getWordOfTheDay(
    date = new Date(),
    options?: { blockOnMissing?: boolean },
  ): Promise<WordOfTheDay> {
    const dateKey = this.toUtcDateString(date);
    const cacheKey = this.buildCacheKey(date);
    const cached = await this.redis.get(cacheKey);
    let value: WordOfTheDay;
    let contentJustResolved = false;
    if (cached) {
      try {
        value = JSON.parse(cached) as WordOfTheDay;
      } catch {
        value = getConversationalWordForDay(date);
        const ttlSeconds = this.secondsUntilNextUtcDay(date);
        await this.redis.set(cacheKey, JSON.stringify(value), ttlSeconds);
        contentJustResolved = true;
      }
    } else {
      value = getConversationalWordForDay(date);
      const ttlSeconds = this.secondsUntilNextUtcDay(date);
      await this.redis.set(cacheKey, JSON.stringify(value), ttlSeconds);
      contentJustResolved = true;
    }

    try {
      const listenAudio = await this.dailyTts.resolveListenAudio(
        'word',
        dateKey,
        value,
        { blockOnMissing: options?.blockOnMissing ?? contentJustResolved },
      );
      return listenAudio ? { ...value, listenAudio } : value;
    } catch (error) {
      this.logger.warn(
        `[WordOfDay] listen audio unavailable for ${dateKey}: ${(error as Error).message}`,
      );
      return value;
    }
  }

  private buildCacheKey(date: Date): string {
    return `engr:wotd:${this.toUtcDateString(date)}`;
  }

  private toUtcDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private secondsUntilNextUtcDay(date: Date): number {
    const nextUtcMidnight = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
    );
    const diffMs = Math.max(60_000, nextUtcMidnight.getTime() - date.getTime());
    return Math.ceil(diffMs / 1000);
  }
}
