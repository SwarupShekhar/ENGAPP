import { client } from '../../../api/client';

export interface WordLookupResult {
  word: string;
  definition: string;
  example: string;
  partOfSpeech: string | null;
  source: 'wordnik';
}

export async function lookupWord(word: string): Promise<WordLookupResult> {
  const trimmed = word.trim();
  const { data } = await client.get<WordLookupResult>('/vocabulary/lookup', {
    params: { word: trimmed },
  });
  return data;
}
