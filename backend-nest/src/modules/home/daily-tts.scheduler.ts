import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PhraseOfDayService } from './services/phrase-of-day.service';
import { WordOfDayService } from './services/word-of-day.service';

@Injectable()
export class DailyTtsScheduler {
  private readonly logger = new Logger(DailyTtsScheduler.name);

  constructor(
    private readonly wordOfDayService: WordOfDayService,
    private readonly phraseOfDayService: PhraseOfDayService,
  ) {}

  /** Pre-bake word/phrase listen audio shortly after UTC midnight. */
  @Cron('5 0 * * *', { timeZone: 'UTC' })
  async prebakeDailyListenAudio(): Promise<void> {
    const today = new Date();
    try {
      await Promise.all([
        this.wordOfDayService.getWordOfTheDay(today, { blockOnMissing: true }),
        this.phraseOfDayService.getPhraseOfTheDay(today, { blockOnMissing: true }),
      ]);
      this.logger.log(
        `Pre-baked daily listen audio for ${today.toISOString().slice(0, 10)}`,
      );
    } catch (error) {
      this.logger.error(
        `[DailyTtsScheduler] Pre-bake failed: ${(error as Error).message}`,
      );
    }
  }
}
