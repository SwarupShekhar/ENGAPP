import { DailyListenAudioMap } from '../utils/daily-listen-script';

export interface PhraseOfDay {
  phrase: string;
  definition: string;
  example: string;
  source: 'curated';
  listenAudio?: DailyListenAudioMap;
}

export interface WordOfTheDay {
  word: string;
  definition: string;
  example: string;
  partOfSpeech: string | null;
  source: 'curated' | 'wordnik';
  listenAudio?: DailyListenAudioMap;
}
