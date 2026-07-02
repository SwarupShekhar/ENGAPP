/** Daily listen voice ids (mapped to Inworld voices at synth time). */
export const DAILY_LISTEN_VOICES = ['Kiki', 'Jasper'] as const;
export type DailyListenVoice = (typeof DAILY_LISTEN_VOICES)[number];

export type DailyListenAudioMap = Partial<Record<DailyListenVoice, string>>;

/** Inworld voice ids for daily bake (Kiki/Jasper are app labels only). */
export const INWORLD_VOICE_BY_DAILY_LABEL: Record<DailyListenVoice, string> = {
  Kiki: 'Olivia',
  Jasper: 'Dennis',
};

export function buildPhraseListenScript(phrase: {
  phrase: string;
  definition: string;
  example: string;
}): string {
  const text = (phrase.phrase || '').trim();
  const def = (phrase.definition || '').trim();
  const ex = (phrase.example || '').trim();
  const parts = [`Today's phrase is ${text.toLowerCase()}.`];
  if (def) parts.push(`It means ${def.replace(/\.$/, '')}.`);
  if (ex) parts.push(`For example: ${ex.replace(/\.$/, '')}.`);
  return parts.join(' ');
}

export function buildWordListenScript(word: {
  word: string;
  definition: string;
  example: string;
  partOfSpeech: string | null;
}): string {
  const text = (word.word || '').trim();
  const def = (word.definition || '').trim();
  const ex = (word.example || '').trim();
  const parts = [`Today's word is ${text}.`];
  if (def) parts.push(`It means ${def.replace(/\.$/, '')}.`);
  if (ex) parts.push(`For example: ${ex.replace(/\.$/, '')}.`);
  return parts.join(' ');
}

export function isDailyListenVoice(value: string): value is DailyListenVoice {
  return (DAILY_LISTEN_VOICES as readonly string[]).includes(value);
}

export function normalizeDailyListenVoice(value?: string | null): DailyListenVoice {
  return isDailyListenVoice((value || '').trim()) ? (value as DailyListenVoice) : 'Kiki';
}
