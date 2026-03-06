import { Injectable, Logger } from '@nestjs/common';
import { BrainService } from '../brain/brain.service';
import { WeaknessService } from '../reels/weakness.service';

export type FlaggedPronunciationError = {
  spoken: string;
  correct: string;
  rule_category: string;
  reel_id: string;
  confidence: number;
};

/**
 * Bridge: backend-ai pronunciation assess → WeaknessService (same pipeline as grammar).
 * Maps rule_category to topic/weakness key (pronunciation_{rule_category}); records delta for Strapi reel alignment.
 */
@Injectable()
export class PronunciationService {
  private readonly logger = new Logger(PronunciationService.name);

  constructor(
    private readonly brain: BrainService,
    private readonly weakness: WeaknessService,
  ) {}

  /**
   * Proxy to backend-ai POST /pronunciation/assess with Azure PA result; returns flagged_errors.
   */
  async assessPronunciation(azureResult: Record<string, unknown>): Promise<{
    flagged_errors: FlaggedPronunciationError[];
  }> {
    const { flagged_errors } =
      await this.brain.assessPronunciation(azureResult);
    return { flagged_errors: flagged_errors as FlaggedPronunciationError[] };
  }

  /**
   * Record each pronunciation error in WeaknessService (same as grammar: topic tag + score delta).
   * topicTag = pronunciation_{rule_category} so Strapi reels can target_sounds match.
   */
  async processFlaggedErrors(
    userId: string,
    flaggedErrors: FlaggedPronunciationError[],
    scoreDelta = -1,
  ): Promise<FlaggedPronunciationError[]> {
    for (const err of flaggedErrors) {
      const key = `pronunciation_${err.rule_category}`;
      await this.weakness.ingestWeakness(userId, key, 'assessment', scoreDelta);
    }
    this.logger.log(
      `processFlaggedErrors userId=${userId} count=${flaggedErrors.length}`,
    );
    return flaggedErrors;
  }

  /**
   * Call backend-ai with recording URL: download audio, POST multipart /pronunciation/assess.
   * Returns flagged_errors and pronunciation_score (score, cefr_cap, dominant_errors, etc.).
   */
  async assessFromRecordingUrl(
    userId: string,
    recordingUrl: string,
    referenceText?: string,
  ): Promise<{
    flagged_errors: FlaggedPronunciationError[];
    pronunciation_score?: {
      score: number;
      cefr_cap: 'A2' | 'B1' | null;
      cap_reason: string | null;
      category_breakdown: Record<string, number>;
      dominant_errors: string[];
    };
  }> {
    const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8001';
    const url = `${aiEngineUrl}/api/pronunciation/assess`;
    try {
      const audioRes = await fetch(recordingUrl);
      if (!audioRes.ok) {
        this.logger.warn(
          `assessFromRecordingUrl download failed ${recordingUrl} ${audioRes.status}`,
        );
        return { flagged_errors: [] };
      }
      const buf = Buffer.from(await audioRes.arrayBuffer());
      const ext =
        recordingUrl.split('.').pop()?.split('?')[0]?.toLowerCase() || 'mp4';
      const filename = `recording.${ext}`;
      const form = new FormData();
      form.append(
        'audio',
        new Blob([buf], { type: 'application/octet-stream' }),
        filename,
      );
      if (referenceText) form.append('reference_text', referenceText);

      const res = await fetch(url, { method: 'POST', body: form });
      if (!res.ok) {
        this.logger.warn(`assessFromRecordingUrl backend-ai ${res.status}`);
        return { flagged_errors: [] };
      }
      const data = (await res.json()) as {
        flagged_errors?: FlaggedPronunciationError[];
        pronunciation_score?: {
          score: number;
          cefr_cap: 'A2' | 'B1' | null;
          cap_reason: string | null;
          category_breakdown: Record<string, number>;
          dominant_errors: string[];
        };
      };
      const flagged = Array.isArray(data.flagged_errors)
        ? data.flagged_errors
        : [];
      await this.processFlaggedErrors(userId, flagged);
      return {
        flagged_errors: flagged,
        pronunciation_score: data.pronunciation_score ?? undefined,
      };
    } catch (e) {
      this.logger.error('assessFromRecordingUrl', e);
      return { flagged_errors: [], pronunciation_score: undefined };
    }
  }
}
