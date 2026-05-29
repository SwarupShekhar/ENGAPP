import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RedisService } from '../../../redis/redis.service';

export interface WordOfTheDay {
  word: string;
  definition: string;
  example: string;
  partOfSpeech: string | null;
  source: 'wordnik' | 'fallback';
}

interface WordnikDefinition {
  text?: string;
  partOfSpeech?: string;
}

interface WordnikExample {
  text?: string;
}

interface WordnikResponse {
  word?: string;
  definitions?: WordnikDefinition[];
  examples?: WordnikExample[];
  note?: string;
}

const FALLBACK_WORDS: ReadonlyArray<WordOfTheDay> = [
  {
    word: 'resilient',
    definition: 'Able to recover quickly from difficulties.',
    example: 'She stayed resilient even when the project got delayed.',
    partOfSpeech: 'adjective',
    source: 'fallback',
  },
  {
    word: 'cohesive',
    definition: 'Forming a united whole.',
    example: 'Their team became more cohesive after regular practice calls.',
    partOfSpeech: 'adjective',
    source: 'fallback',
  },
  {
    word: 'articulate',
    definition: 'Able to express ideas clearly and effectively.',
    example: 'He gave an articulate response during the mock interview.',
    partOfSpeech: 'adjective',
    source: 'fallback',
  },
  {
    word: 'insight',
    definition: 'A deep and accurate understanding of something.',
    example: 'Daily speaking practice gave her insight into common mistakes.',
    partOfSpeech: 'noun',
    source: 'fallback',
  },
  {
    word: 'refine',
    definition: 'To improve something by making small changes.',
    example: 'Use feedback sessions to refine your pronunciation.',
    partOfSpeech: 'verb',
    source: 'fallback',
  },
];

@Injectable()
export class WordOfDayService {
  private readonly logger = new Logger(WordOfDayService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async getWordOfTheDay(date = new Date()): Promise<WordOfTheDay> {
    const cacheKey = this.buildCacheKey(date);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as WordOfTheDay;
      } catch {
        // Continue with fresh fetch when cached blob is malformed.
      }
    }

    const fromApi = await this.fetchFromWordnik(date);
    const value = fromApi ?? this.getFallbackForDay(date);
    const ttlSeconds = this.secondsUntilNextUtcDay(date);
    await this.redis.set(cacheKey, JSON.stringify(value), ttlSeconds);
    return value;
  }

  private async fetchFromWordnik(date: Date): Promise<WordOfTheDay | null> {
    const apiKey = this.config.get<string>('WORDNIK_API_KEY')?.trim() ?? '';
    if (!apiKey) {
      this.logger.warn('[WordOfDay] WORDNIK_API_KEY missing, using fallback');
      return null;
    }

    const dateString = this.toUtcDateString(date);
    try {
      const response = await axios.get<WordnikResponse>(
        'https://api.wordnik.com/v4/words.json/wordOfTheDay',
        {
          params: {
            date: dateString,
            api_key: apiKey,
          },
          timeout: 7000,
        },
      );

      const data = response.data;
      const word = (data.word ?? '').trim();
      const definition = (data.definitions?.find((d) => d.text?.trim())?.text ?? '').trim();
      const example = (data.examples?.find((e) => e.text?.trim())?.text ?? '').trim();
      const partOfSpeech = (data.definitions?.find((d) => d.partOfSpeech?.trim())?.partOfSpeech ?? '').trim();

      if (!word || !definition) {
        this.logger.warn('[WordOfDay] Incomplete Wordnik payload, falling back');
        return null;
      }

      return {
        word,
        definition,
        example: example || `Try using "${word}" in a sentence today.`,
        partOfSpeech: partOfSpeech || null,
        source: 'wordnik',
      };
    } catch (error) {
      this.logger.warn(
        `[WordOfDay] Wordnik request failed for ${dateString}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private buildCacheKey(date: Date): string {
    return `wordnik:wotd:${this.toUtcDateString(date)}`;
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

  private getFallbackForDay(date: Date): WordOfTheDay {
    const daySeed = Math.floor(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
        (24 * 60 * 60 * 1000),
    );
    const index = Math.abs(daySeed) % FALLBACK_WORDS.length;
    return FALLBACK_WORDS[index];
  }
}
