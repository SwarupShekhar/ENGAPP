import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import { DailyTtsService } from './daily-tts.service';
import { PhraseOfDay } from '../types/daily-content.types';

export type { PhraseOfDay } from '../types/daily-content.types';

const FALLBACK_PHRASES: ReadonlyArray<PhraseOfDay> = [
  { phrase: 'Let\'s circle back on this', definition: 'To return to a topic or task later.', example: 'Let\'s circle back on this after the meeting ends.', source: 'curated' },
  { phrase: 'I\'ll keep you in the loop', definition: 'To keep someone informed about updates.', example: 'I\'ll keep you in the loop as the project develops.', source: 'curated' },
  { phrase: 'Could you elaborate on that?', definition: 'To ask someone to explain in more detail.', example: 'Could you elaborate on that point about the timeline?', source: 'curated' },
  { phrase: 'I\'d like to follow up on this', definition: 'To check progress or continue a discussion.', example: 'I\'d like to follow up on this before the deadline.', source: 'curated' },
  { phrase: 'Let\'s touch base tomorrow', definition: 'To connect briefly to share information.', example: 'Let\'s touch base tomorrow morning to sync up.', source: 'curated' },
  { phrase: 'I appreciate your feedback', definition: 'To express gratitude for someone\'s opinion.', example: 'I appreciate your feedback — it really helped me improve.', source: 'curated' },
  { phrase: 'Can we get on the same page?', definition: 'To ensure everyone shares the same understanding.', example: 'Can we get on the same page before the client call?', source: 'curated' },
  { phrase: 'I\'ll take the lead on this', definition: 'To take responsibility for managing something.', example: 'I\'ll take the lead on this and report back Friday.', source: 'curated' },
  { phrase: 'Let\'s revisit this later', definition: 'To plan to discuss something again in the future.', example: 'Let\'s revisit this later when we have more data.', source: 'curated' },
  { phrase: 'I\'m happy to connect', definition: 'A polite way to offer to meet or talk.', example: 'I\'m happy to connect whenever you have time this week.', source: 'curated' },
  { phrase: 'That\'s a valid concern', definition: 'To acknowledge that someone\'s worry is reasonable.', example: 'That\'s a valid concern — let me look into it right away.', source: 'curated' },
  { phrase: 'Moving forward, we should', definition: 'To discuss the plan for future actions.', example: 'Moving forward, we should document all decisions.', source: 'curated' },
];

@Injectable()
export class PhraseOfDayService {
  private readonly logger = new Logger(PhraseOfDayService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly dailyTts: DailyTtsService,
  ) {}

  async getPhraseOfTheDay(date = new Date()): Promise<PhraseOfDay> {
    const dateKey = this.toUtcDateString(date);
    const cacheKey = `engr:potd:${dateKey}`;
    const cached = await this.redis.get(cacheKey);
    let value: PhraseOfDay;
    let contentJustResolved = false;
    if (cached) {
      try {
        value = JSON.parse(cached) as PhraseOfDay;
      } catch {
        value = this.getForDay(date);
        const ttl = this.secondsUntilNextUtcDay(date);
        await this.redis.set(cacheKey, JSON.stringify(value), ttl);
        contentJustResolved = true;
      }
    } else {
      value = this.getForDay(date);
      const ttl = this.secondsUntilNextUtcDay(date);
      await this.redis.set(cacheKey, JSON.stringify(value), ttl);
      contentJustResolved = true;
    }

    const listenAudio = await this.dailyTts.resolveListenAudio(
      'phrase',
      dateKey,
      value,
      { blockOnMissing: contentJustResolved },
    );
    return listenAudio ? { ...value, listenAudio } : value;
  }

  private getForDay(date: Date): PhraseOfDay {
    const seed = Math.floor(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
        (24 * 60 * 60 * 1000),
    );
    return FALLBACK_PHRASES[Math.abs(seed) % FALLBACK_PHRASES.length];
  }

  private toUtcDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private secondsUntilNextUtcDay(date: Date): number {
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
    return Math.ceil(Math.max(60_000, next.getTime() - date.getTime()) / 1000);
  }
}
