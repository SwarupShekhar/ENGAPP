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

export interface FullFeedbackNarrationPayload {
  pronunciation_issues?: NarrationError[];
  grammar_mistakes?: NarrationError[];
  vocabulary_issues?: NarrationError[];
  scores?: {
    pronunciation?: number;
    grammar?: number;
    vocabulary?: number;
    fluency?: number;
  };
  justifications?: {
    pronunciation?: string;
    grammar?: string;
    vocabulary?: string;
    fluency?: string;
  };
}

/**
 * Fetches a single sequential TTS narration covering ALL feedback sections.
 * Used by the "Listen to Feedback" button — plays the entire feedback as one audio.
 */
export async function fetchFullFeedbackNarration(
  payload: FullFeedbackNarrationPayload,
): Promise<FeedbackNarrationResponse> {
  const res = await client.post<FeedbackNarrationResponse>(
    '/api/tts/full-feedback-narration',
    payload,
    { timeout: 20000 },
  );
  return res.data;
}
