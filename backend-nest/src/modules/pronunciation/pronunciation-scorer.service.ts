/**
 * Pronunciation-enhanced scoring (Nest mirror).
 * Receives pronunciation_score from backend-ai and applies it to overall score + CEFR cap.
 * All cap logic is driven by Python scorer; this service just enforces the cap on the final number.
 */
import { Injectable } from '@nestjs/common';

export interface PronunciationScoreResult {
  score: number;
  cefr_cap: 'A2' | 'B1' | null;
  cap_reason: string | null;
  category_breakdown: Record<string, number>;
  dominant_errors: string[];
}

export interface ScoreComponents {
  grammar: number;
  vocabulary: number;
  fluency: number;
  pronunciation: number;
}

const WEIGHTS = {
  grammar: 0.25,
  vocabulary: 0.2,
  fluency: 0.25,
  pronunciation: 0.3,
};

@Injectable()
export class PronunciationScorerService {
  /**
   * Recompute overall score using the new pronunciation score from backend-ai.
   * Overall = (grammar × 0.25) + (vocabulary × 0.20) + (fluency × 0.25) + (pronunciation × 0.30).
   */
  applyPronunciationScore(
    components: ScoreComponents,
    pronunciationScoreFromAi: number,
  ): number {
    const pron = Math.max(0, Math.min(100, pronunciationScoreFromAi));
    return (
      (components.grammar || 0) * WEIGHTS.grammar +
      (components.vocabulary || 0) * WEIGHTS.vocabulary +
      (components.fluency || 0) * WEIGHTS.fluency +
      pron * WEIGHTS.pronunciation
    );
  }

  /**
   * If backend-ai set a CEFR cap, cap the final score so level doesn't exceed it.
   * A2 cap → max score 45, B1 cap → max score 60.
   */
  applyCEFRCap(
    calculatedScore: number,
    cefrCap: 'A2' | 'B1' | null,
  ): number {
    if (!cefrCap) return calculatedScore;
    const capScore = cefrCap === 'A2' ? 45 : 60;
    return Math.min(calculatedScore, capScore);
  }
}
