/** Matches Kitten TTS voice ids exposed in the app. */
export const DAILY_LISTEN_VOICES = ['Kiki', 'Jasper'] as const;
export type DailyListenVoice = (typeof DAILY_LISTEN_VOICES)[number];

export type DailyListenAudioMap = Partial<Record<DailyListenVoice, string>>;

export function buildPhraseListenScript(phrase: {
  phrase: string;
  definition: string;
  example: string;
}): string {
  const def = (phrase.definition || '').trim();
  const ex = (phrase.example || '').trim();
  return [phrase.phrase, def && `Meaning - ${def}`, ex && `For example - ${ex}`]
    .filter(Boolean)
    .join('. ');
}

export function buildWordListenScript(word: {
  word: string;
  definition: string;
  example: string;
  partOfSpeech: string | null;
}): string {
  const pos = word.partOfSpeech ? `${word.partOfSpeech}. ` : '';
  const def = (word.definition || '').trim();
  const ex = (word.example || '').trim();
  return [`${word.word}. ${pos}`.trim(), def && `Meaning - ${def}`, ex && `For example - ${ex}`]
    .filter(Boolean)
    .join('. ');
}

export function isDailyListenVoice(value: string): value is DailyListenVoice {
  return (DAILY_LISTEN_VOICES as readonly string[]).includes(value);
}

export function normalizeDailyListenVoice(value?: string | null): DailyListenVoice {
  return isDailyListenVoice((value || '').trim()) ? (value as DailyListenVoice) : 'Kiki';
}
