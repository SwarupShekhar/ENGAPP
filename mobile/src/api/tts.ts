import { client } from './client';

export type FeedbackSection = 'pronunciation' | 'grammar' | 'vocabulary' | 'fluency';

export interface NarrationError {
  spoken?: string;
  correct?: string;
  rule_category?: string;
  original_text?: string;
  corrected_text?: string;
}

export interface FeedbackNarrationPayload {
  section: FeedbackSection;
  score: number;
  justification?: string;
  errors?: NarrationError[];
}

export interface FeedbackNarrationResponse {
  audio_base64: string;
  text: string;
}

/**
 * Fetches a TTS narration for one feedback section.
 * Returns { audio_base64, text } from backend-ai via NestJS proxy.
 * audio_base64 is MP3 encoded as base64.
 */
export async function fetchFeedbackNarration(
  payload: FeedbackNarrationPayload,
): Promise<FeedbackNarrationResponse> {
  const res = await client.post<FeedbackNarrationResponse>(
    '/api/tts/feedback-narration',
    payload,
    { timeout: 15000 },
  );
  return res.data;
}
