import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BrainService } from '../brain/brain.service';
import { WeaknessService } from '../reels/weakness.service';
import type { DeliveryInsightDto } from '../../common/types/delivery-insight.types';

export type FlaggedPronunciationError = {
  spoken: string;
  correct?: string;
  rule_category: string;
  reel_id?: string | null;
  confidence: number;
};

/** Human-readable tip for pronunciation issues (rule_category from detector). */
function formatPronunciationSuggestion(
  ruleCategory: string,
  correctWord?: string,
): string {
  const tips: Record<string, string> = {
    w_to_v: 'Practice "w" vs "v" (e.g. "wine" vs "vine")',
    v_to_w_reversal: 'Practice "v" vs "w" (e.g. "very" vs "wery")',
    th_to_t: 'Practice "th" /θ/ vs "t" (e.g. "think" vs "tink")',
    th_to_d: 'Practice "th" /ð/ vs "d" (e.g. "the" vs "de")',
    zh_to_j: 'Practice "s" in "vision" vs "j" sound',
    z_to_j: 'Practice "z" vs "j" in words like "measure"',
    h_dropping: 'Pronounce the "h" at the start of words',
    r_rolling: 'Soften "r" — avoid rolling or heavy "r"',
    ae_to_e: 'Practice /æ/ vs /e/ (e.g. "cat" vs "ket")',
    i_to_ee: 'Practice short "i" vs long "ee"',
    o_to_aa: 'Practice vowel in "go" vs "got"',
    general_mispronunciation: `Practice pronouncing "${correctWord}" more clearly`,
  };
  return (
    tips[ruleCategory] ||
    `Practice "${correctWord || ruleCategory.replace(/_/g, ' ')}"`
  );
}

function severityForConfidence(confidence?: number): 'high' | 'medium' | 'low' {
  if (confidence == null) return 'medium';
  if (confidence < 40) return 'high';
  if (confidence < 65) return 'medium';
  return 'low';
}

function aiEngineAuthHeadersFromEnv(): Record<string, string> {
  const key = process.env.INTERNAL_API_KEY;
  return key ? { 'x-api-key': key } : {};
}

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
    private readonly prisma: PrismaService,
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

  async savePronunciationIssues(
    analysisId: string,
    flaggedErrors: FlaggedPronunciationError[],
  ): Promise<number> {
    await this.prisma.pronunciationIssue.deleteMany({
      where: { analysisId },
    });

    const data = (flaggedErrors || [])
      .filter((err) => Boolean(err?.spoken?.trim()))
      .map((err) => {
        const spoken = err.spoken.trim();
        const correct = err.correct?.trim() || null;
        const ruleCategory = err.rule_category || 'general_mispronunciation';
        return {
          analysisId,
          word: spoken,
          spoken,
          correct,
          ruleCategory,
          reelId: err.reel_id || null,
          issueType: ruleCategory,
          severity: severityForConfidence(err.confidence),
          confidence: err.confidence,
          suggestion: formatPronunciationSuggestion(
            ruleCategory,
            correct || spoken,
          ),
        };
      });

    if (data.length === 0) {
      return 0;
    }

    const result = await this.prisma.pronunciationIssue.createMany({ data });
    return result.count;
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
      azure_result?: Record<string, unknown>;
    };
    deliveryInsights?: DeliveryInsightDto[] | null;
    fluencyBreakdown?: Record<string, unknown> | null;
  }> {
    const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8001';
    const url = `${aiEngineUrl}/api/pronunciation/assess`;
    try {
      const form = new FormData();
      form.append('audio_url', recordingUrl);
      if (referenceText) form.append('reference_text', referenceText);

      this.logger.log(
        `assessFromRecordingUrl sending audio_url to backend-ai: ${recordingUrl.substring(0, 80)}...`,
      );

      const res = await fetch(url, {
        method: 'POST',
        body: form,
        headers: aiEngineAuthHeadersFromEnv(),
      });
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
        azure_result?: Record<string, unknown>;
        delivery_insights?: DeliveryInsightDto[] | null;
        fluency_breakdown?: Record<string, unknown> | null;
      };
      const flagged = Array.isArray(data.flagged_errors)
        ? data.flagged_errors
        : [];
      await this.processFlaggedErrors(userId, flagged);
      return {
        flagged_errors: flagged,
        pronunciation_score: data.pronunciation_score
          ? {
              ...data.pronunciation_score,
              azure_result: data.azure_result,
            }
          : undefined,
        deliveryInsights: data.delivery_insights ?? null,
        fluencyBreakdown: data.fluency_breakdown ?? null,
      };
    } catch (e) {
      this.logger.error('assessFromRecordingUrl', e);
      return { flagged_errors: [], pronunciation_score: undefined };
    }
  }

  /**
   * Same as assessFromRecordingUrl but for an uploaded buffer (practice clip).
   */
  async assessFromUploadedFile(
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    referenceText?: string,
  ): Promise<{ accuracy: number; errored: boolean }> {
    const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8001';
    const url = `${aiEngineUrl}/api/pronunciation/assess`;
    try {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || 'audio/m4a' });
      form.append('audio', blob, file.originalname || 'audio.m4a');
      if (referenceText) form.append('reference_text', referenceText);
      const res = await fetch(url, {
        method: 'POST',
        body: form,
        headers: aiEngineAuthHeadersFromEnv(),
      });
      if (!res.ok) {
        this.logger.warn(`assessFromUploadedFile backend-ai ${res.status}`);
        return { accuracy: 0, errored: true };
      }
      const data = (await res.json()) as {
        pronunciation_score?: { score?: number };
        azure_result?: { accuracy_score?: number };
      };
      const accuracy =
        data.azure_result?.accuracy_score ??
        data.pronunciation_score?.score ??
        0;
      return { accuracy: Math.max(0, Math.min(100, Number(accuracy))), errored: false };
    } catch (e) {
      this.logger.error('assessFromUploadedFile', e as Error);
      return { accuracy: 0, errored: true };
    }
  }

  async assessFromUploadedFileWithWords(
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    referenceText?: string,
  ): Promise<{
    accuracy: number;
    words: Array<{ word: string; accuracy: number }>;
    fluencyScore: number | null;
    prosodyScore: number | null;
    errored: boolean;
  }> {
    const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8001';
    const url = `${aiEngineUrl}/api/pronunciation/assess`;
    try {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || 'audio/m4a' });
      form.append('audio', blob, file.originalname || 'audio.m4a');
      if (referenceText) form.append('reference_text', referenceText);
      const res = await fetch(url, {
        method: 'POST',
        body: form,
        headers: aiEngineAuthHeadersFromEnv(),
      });
      if (!res.ok) {
        this.logger.warn(`assessFromUploadedFileWithWords backend-ai ${res.status}`);
        return { accuracy: 0, words: [], fluencyScore: null, prosodyScore: null, errored: true };
      }
      const data = (await res.json()) as {
        pronunciation_score?: { score?: number };
        azure_result?: {
          Words?: Array<{
            Word?: string;
            AccuracyScore?: number;
            PronunciationAssessment?: { AccuracyScore?: number };
          }>;
          fluency_score?: number;
          prosody_score?: number;
          accuracy_score?: number;
        };
      };
      const accuracy = data.azure_result?.accuracy_score ?? data.pronunciation_score?.score ?? 0;
      const rawWords = data.azure_result?.Words ?? [];
      const words = rawWords
        .filter((w) => w.Word?.trim())
        .map((w) => ({
          word: (w.Word as string).toLowerCase().trim(),
          accuracy: Math.max(0, Math.min(100, Number(
            w.AccuracyScore ?? w.PronunciationAssessment?.AccuracyScore ?? 0,
          ))),
        }));
      return {
        accuracy: Math.max(0, Math.min(100, Number(accuracy))),
        words,
        fluencyScore: data.azure_result?.fluency_score ?? null,
        prosodyScore: data.azure_result?.prosody_score ?? null,
        errored: false,
      };
    } catch (e) {
      this.logger.error('assessFromUploadedFileWithWords', e as Error);
      return { accuracy: 0, words: [], fluencyScore: null, prosodyScore: null, errored: true };
    }
  }
}
