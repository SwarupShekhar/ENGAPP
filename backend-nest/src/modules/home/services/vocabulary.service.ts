import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RedisService } from '../../../redis/redis.service';

export interface WordLookupResult {
  word: string;
  definition: string;
  example: string;
  partOfSpeech: string | null;
  source: 'wordnik';
}

interface WordnikDefinition {
  text?: string;
  partOfSpeech?: string;
}

interface WordnikExamplesResponse {
  examples?: Array<{ text?: string }>;
}

const LOOKUP_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const WORD_PATTERN = /^[a-z0-9][a-z0-9\s'-]{0,38}[a-z0-9]$|^[a-z0-9]$/;

@Injectable()
export class VocabularyService {
  private readonly logger = new Logger(VocabularyService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async lookup(rawWord: string): Promise<WordLookupResult> {
    const word = this.normalizeLookupWord(rawWord);
    this.assertValidWord(word);

    const cacheKey = `wordnik:lookup:${word}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as WordLookupResult;
      } catch {
        await this.redis.del(cacheKey);
      }
    }

    const result = await this.fetchFromWordnik(word);
    await this.redis.set(cacheKey, JSON.stringify(result), LOOKUP_CACHE_TTL_SECONDS);
    return result;
  }

  private normalizeLookupWord(raw: string): string {
    return (raw || '').trim().toLowerCase();
  }

  private assertValidWord(word: string): void {
    if (!WORD_PATTERN.test(word)) {
      throw new BadRequestException(
        'Enter a valid word or short phrase (2–40 characters).',
      );
    }
  }

  private async fetchFromWordnik(word: string): Promise<WordLookupResult> {
    const apiKey = this.config.get<string>('WORDNIK_API_KEY')?.trim() ?? '';
    if (!apiKey) {
      this.logger.warn('[Vocabulary] WORDNIK_API_KEY missing');
      throw new ServiceUnavailableException('Word lookup is temporarily unavailable');
    }

    const encodedWord = encodeURIComponent(word);
    try {
      const [definitionsRes, examplesRes] = await Promise.all([
        axios.get<WordnikDefinition[]>(
          `https://api.wordnik.com/v4/word.json/${encodedWord}/definitions`,
          {
            params: {
              limit: 5,
              useCanonical: true,
              api_key: apiKey,
            },
            timeout: 7000,
          },
        ),
        axios.get<WordnikExamplesResponse>(
          `https://api.wordnik.com/v4/word.json/${encodedWord}/examples`,
          {
            params: {
              limit: 5,
              useCanonical: true,
              api_key: apiKey,
            },
            timeout: 7000,
          },
        ),
      ]);

      const definitionEntry = definitionsRes.data?.find((d) => d.text?.trim());
      const definition = (definitionEntry?.text ?? '').trim();
      const partOfSpeech = (definitionEntry?.partOfSpeech ?? '').trim() || null;
      const example =
        (examplesRes.data?.examples?.find((e) => e.text?.trim())?.text ?? '').trim() ||
        `Try using "${word}" in a sentence today.`;

      if (!definition) {
        throw new NotFoundException(`No definition found for "${word}"`);
      }

      return {
        word,
        definition,
        example,
        partOfSpeech,
        source: 'wordnik',
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      if (status === 404) {
        throw new NotFoundException(`No definition found for "${word}"`);
      }

      this.logger.warn(
        `[Vocabulary] Wordnik lookup failed for "${word}": ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException('Word lookup is temporarily unavailable');
    }
  }
}
