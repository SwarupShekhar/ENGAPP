import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BrainService } from '../brain/brain.service';
import { ProgressService } from '../progress/progress.service';
import { ScoreAuthorityService } from '../score-authority/score-authority.service';
import {
  clampScore,
  deriveCefrFromOverall,
  type PillarScores,
} from '../score-authority/score-authority.formulas';
import {
  type DeliveryInsightDto,
  type SessionEnrichment,
  hasDeliveryInsights,
} from '../../common/types/delivery-insight.types';

export type { DeliveryInsightDto, SessionEnrichment };

export type SessionScorePayload = {
  pronunciation: number;
  fluency: number;
  grammar: number;
  vocabulary: number;
  comprehension: number;
  overall_score: number;
  overall: number;
  grammar_score: number;
  pronunciation_score: number;
  fluency_score: number;
  vocabulary_score: number;
  source: 'cqs';
  pronunciationMeasured: boolean;
  pronunciationEstimated?: boolean;
  /** False when the LLM grammar grader failed/was disabled — UI must not show a
   * grammar % in that case (we do NOT fall back to the blind structural score). */
  grammarMeasured: boolean;
  /** Call path does not measure comprehension yet — UI must not show "0%". */
  comprehensionMeasured: boolean;
};

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brain: BrainService,
    private readonly progress: ProgressService,
    private readonly scoreAuthority: ScoreAuthorityService,
  ) {}

  /** True when scores are the known LLM/placeholder sentinel (all ~50). */
  static isPlaceholderScores(scores: Record<string, unknown> | null | undefined): boolean {
    if (!scores || typeof scores !== 'object') return true;
    const keys = [
      'overall_score',
      'overall',
      'grammar_score',
      'grammar',
      'pronunciation_score',
      'pronunciation',
      'fluency_score',
      'fluency',
      'vocabulary_score',
      'vocabulary',
    ] as const;
    const values = keys
      .map((k) => Number((scores as any)[k]))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (values.length === 0) return true;
    // All present scores sit on the neutral 50 sentinel.
    return values.every((n) => n >= 48 && n <= 52);
  }

  /** Text-only fluency when Azure PA fluency is missing. */
  static estimateFluencyFromText(turns: string[]): number {
    const text = turns.join(' ').trim();
    const words = text.match(/\b[a-zA-Z]+\b/g) ?? [];
    if (words.length === 0) return 0;

    const fillers = (text.match(/\b(um|uh|er|like|you know|basically)\b/gi) ?? [])
      .length;
    const turnsWithWords = turns.filter((t) => /\b[a-zA-Z]+\b/.test(t)).length || 1;
    const avgWordsPerTurn = words.length / turnsWithWords;

    // Short trivial speech stays low; longer turns climb toward ~80.
    let score = Math.min(85, 25 + avgWordsPerTurn * 2.5);
    score -= Math.min(25, fillers * 1.5);
    if (words.length < 10) score = Math.min(score, 20);
    else if (words.length < 25) score = Math.min(score, 40);
    else if (words.length < 50) score = Math.min(score, 60);

    return clampScore(score);
  }

  /** Count alphabetic words in user turns for issue-rate denominators. */
  static countTranscriptWords(userTurns: string[]): number {
    return (userTurns.join(' ').match(/\b[a-zA-Z]+\b/g) ?? []).length;
  }

  /**
   * Build absolute session pillar scores from CQS breakdown.
   * Never returns the all-50 placeholder pattern.
   */
  buildSessionScoresFromCqs(
    breakdown: Record<string, any>,
    cqs: number,
    userTurns: string[],
    options?: {
      pronunciationIssueCount?: number;
      transcriptWordCount?: number;
    },
  ): SessionScorePayload {
    const pqsRaw = breakdown?.pqs;
    const pqs =
      typeof pqsRaw === 'object' && pqsRaw != null
        ? Number(pqsRaw.pqs ?? 0)
        : Number(pqsRaw ?? 0);
    const wordCount =
      typeof pqsRaw === 'object' && pqsRaw != null
        ? Number(pqsRaw.word_count ?? 0)
        : 0;
    let pronunciationMeasured = wordCount > 0 && pqs > 0;
    let pronunciationEstimated = false;

    let fluency = Number(
      breakdown.fluency_signal ?? pqsRaw?.mean_fluency ?? 0,
    );
    if (!Number.isFinite(fluency) || fluency <= 0) {
      fluency = ScoringService.estimateFluencyFromText(userTurns);
    }

    // Grammar: LLM grader is authoritative. On fallback the AI service returns
    // grammar_signal=null and grammar_measured=false. We do NOT fabricate a
    // grammar number from depth/complexity (that reintroduced the blind ~70 bug):
    // grammar becomes not_measured and is excluded from the overall (like
    // comprehension), honoring the evidence-minimum rule.
    const grammarSignal = breakdown.grammar_signal;
    const grammarMeasuredRaw = breakdown.grammar_measured;
    let grammar = 0;
    let grammarMeasured = false;
    if (grammarMeasuredRaw !== false && grammarSignal != null) {
      const g = Number(grammarSignal);
      if (Number.isFinite(g) && g >= 0) {
        grammar = clampScore(g);
        grammarMeasured = true;
      }
    }

    const ds = Number(breakdown.ds ?? 0);
    let vocabulary = Number(breakdown.vocabulary_signal ?? 0);
    if (!Number.isFinite(vocabulary) || vocabulary <= 0) {
      vocabulary = clampScore(ds * 0.8);
    }
    if (vocabulary <= 0) {
      const words = userTurns.join(' ').match(/\b[a-zA-Z]+\b/g) ?? [];
      const unique = new Set(words.map((w) => w.toLowerCase()));
      vocabulary =
        words.length === 0
          ? 0
          : clampScore(Math.min(80, (unique.size / words.length) * 100));
    }

    let pronunciation = pronunciationMeasured ? clampScore(pqs) : 0;

    const issueCount = Number(options?.pronunciationIssueCount ?? 0);
    const transcriptWordCount =
      Number(options?.transcriptWordCount ?? 0) ||
      ScoringService.countTranscriptWords(userTurns);
    if (
      !pronunciationMeasured &&
      issueCount > 0 &&
      transcriptWordCount > 0
    ) {
      const issueRate = issueCount / transcriptWordCount;
      pronunciation = Math.round(
        Math.max(5, Math.min(70, 100 - issueRate * 300)),
      );
      pronunciationMeasured = true;
      pronunciationEstimated = true;
    }

    const pillars: PillarScores = {
      pronunciation: pronunciationMeasured ? pronunciation : 0,
      fluency: clampScore(fluency),
      grammar: grammarMeasured ? grammar : 0,
      vocabulary: clampScore(vocabulary),
      comprehension: 0,
    };

    // Cross-pillar dependencies live in ONE place only: the Python scoring
    // service. Pronunciation's influence on fluency is applied there, and
    // grammar/vocabulary are independent. This TS layer passes pillar scores
    // through unchanged and only computes the weighted overall below.

    const comprehensionMeasured = false;
    pillars.comprehension = 0;

    // Overall = weighted sum over MEASURED pillars only, renormalized by the sum
    // of their weights. Unmeasured pillars (grammar on LLM fallback, pronunciation
    // when Azure PA is absent, comprehension always) are dropped, never fabricated.
    const weightDefs: Array<[keyof PillarScores, number, boolean]> = [
      ['fluency', 0.25, true],
      ['grammar', 0.22, grammarMeasured],
      ['pronunciation', 0.22, pronunciationMeasured],
      ['vocabulary', 0.18, true],
    ];
    let active = 0;
    let weightSum = 0;
    for (const [key, weight, measured] of weightDefs) {
      if (measured) {
        active += pillars[key] * weight;
        weightSum += weight;
      }
    }
    let overall = weightSum > 0 ? Math.round(active / weightSum) : 0;
    if (!pronunciationMeasured && cqs > 0) {
      // No Azure PA: blend the transcript-only aggregate with the CQS composite.
      overall = clampScore(Math.round(overall * 0.55 + cqs * 0.45));
    }

    // Guard: never emit the neutral placeholder cluster.
    if (
      overall >= 48 &&
      overall <= 52 &&
      pillars.grammar >= 48 &&
      pillars.grammar <= 52 &&
      pillars.fluency >= 48 &&
      pillars.fluency <= 52
    ) {
      overall = clampScore(overall - 1);
    }

    pronunciation = pillars.pronunciation;
    fluency = pillars.fluency;
    grammar = pillars.grammar;
    vocabulary = pillars.vocabulary;

    return {
      pronunciation,
      fluency,
      grammar,
      vocabulary,
      comprehension: 0,
      overall_score: overall,
      overall,
      grammar_score: grammar,
      pronunciation_score: pronunciation,
      fluency_score: fluency,
      vocabulary_score: vocabulary,
      source: 'cqs',
      pronunciationMeasured,
      grammarMeasured,
      comprehensionMeasured,
      ...(pronunciationEstimated ? { pronunciationEstimated: true } : {}),
    };
  }

  private async countPronunciationIssues(participantId: string): Promise<number> {
    return this.prisma.pronunciationIssue.count({
      where: { analysis: { participantId } },
    });
  }

  /**
   * True when a stored CQS row reflects Azure PA (pqs > 0 ≈ breakdown word_count > 0).
   * Do not treat a bare CallQualityScore row as PA-complete without this.
   */
  static cqsRowHasPaWordMeasurement(
    cqs: { pqs: number } | null | undefined,
  ): boolean {
    return !!cqs && Number(cqs.pqs ?? 0) > 0;
  }

  /**
   * Skip PA backfill only when CQS already has word-level PA and delivery coaching exists.
   * A CallQualityScore row alone (pqs = 0) is not enough — webhook may have saved issues first.
   */
  async shouldSkipPaBackfill(
    participantId: string,
    existingCqs: { pqs: number } | null | undefined,
  ): Promise<boolean> {
    if (!ScoringService.cqsRowHasPaWordMeasurement(existingCqs)) {
      return false;
    }
    return !(await this.analysisMissingDeliveryInsights(participantId));
  }

  /** True when analysis has no delivery coaching bullets yet. */
  async analysisMissingDeliveryInsights(participantId: string): Promise<boolean> {
    const analysis = await this.prisma.analysis.findUnique({
      where: { participantId },
      select: { rawData: true },
    });
    const insights = (analysis?.rawData as Record<string, unknown> | undefined)
      ?.deliveryInsights;
    return !Array.isArray(insights) || insights.length === 0;
  }

  /** Patch delivery insights onto analysis without touching scores or CQS. */
  async persistSessionEnrichment(
    participantId: string,
    enrichment: SessionEnrichment,
  ): Promise<void> {
    if (!hasDeliveryInsights(enrichment)) return;
    try {
      const existing = await this.prisma.analysis.findUnique({
        where: { participantId },
        select: { rawData: true },
      });
      if (!existing) {
        this.logger.warn(
          `persistSessionEnrichment: no analysis for participantId=${participantId}`,
        );
        return;
      }
      const raw = (existing.rawData as Record<string, unknown>) || {};
      await this.prisma.analysis.update({
        where: { participantId },
        data: {
          rawData: {
            ...raw,
            deliveryInsights: enrichment.deliveryInsights,
          } as any,
        },
      });
    } catch (e: any) {
      this.logger.warn(
        `persistSessionEnrichment failed participantId=${participantId}: ${e.message}`,
      );
    }
  }

  private fluencyMetaFromBreakdown(
    breakdown: Record<string, unknown> | undefined,
    sessionEnrichment?: SessionEnrichment,
  ) {
    const fb = breakdown?.fluency_breakdown as Record<string, unknown> | undefined;
    const deliveryInsights = sessionEnrichment?.deliveryInsights ?? undefined;
    if (!fb && !deliveryInsights?.length) return undefined;
    return {
      fluencyBreakdown: fb,
      hesitationMarkers: fb
        ? ((fb.hesitation_markers as Record<string, unknown>) ?? {
            filler_words_count: fb.fillerCount ?? 0,
            pauses_count: fb.pause_count ?? 0,
            top_fillers: fb.topFillers ?? [],
            wpm: fb.wpm ?? 0,
          })
        : undefined,
      wpm: fb ? Number(fb.wpm ?? 0) : undefined,
      deliveryInsights,
    };
  }

  private async writeAnalysisScores(
    participantId: string,
    scores: SessionScorePayload,
    cefrLevel: string,
    fluencyMeta?: {
      fluencyBreakdown?: Record<string, unknown>;
      hesitationMarkers?: Record<string, unknown>;
      wpm?: number;
      deliveryInsights?: DeliveryInsightDto[] | null;
    },
  ): Promise<void> {
    try {
      const data: Record<string, unknown> = {
        scores: scores as any,
        cefrLevel,
      };

      const hasFluencyMeta =
        fluencyMeta?.fluencyBreakdown ||
        fluencyMeta?.hesitationMarkers ||
        fluencyMeta?.wpm != null;
      const hasDeliveryInsights =
        Array.isArray(fluencyMeta?.deliveryInsights) &&
        fluencyMeta.deliveryInsights.length > 0;

      if (hasFluencyMeta || hasDeliveryInsights) {
        const existing = await this.prisma.analysis.findUnique({
          where: { participantId },
          select: { rawData: true },
        });
        const raw = (existing?.rawData as Record<string, unknown>) || {};
        const nextRaw: Record<string, unknown> = { ...raw };

        if (hasFluencyMeta) {
          const azureEvidence = {
            ...((raw.azureEvidence as Record<string, unknown>) || {}),
            wpm: fluencyMeta!.wpm ?? (fluencyMeta!.fluencyBreakdown as any)?.wpm,
            fluencyBreakdown: fluencyMeta!.fluencyBreakdown,
          };
          nextRaw.azureEvidence = azureEvidence;
          if (fluencyMeta!.fluencyBreakdown) {
            nextRaw.fluencyBreakdown = fluencyMeta!.fluencyBreakdown;
          }
          if (fluencyMeta!.hesitationMarkers) {
            data.hesitationMarkers = fluencyMeta!.hesitationMarkers as any;
          }
        }

        if (hasDeliveryInsights) {
          nextRaw.deliveryInsights = fluencyMeta!.deliveryInsights;
        }

        data.rawData = nextRaw as any;
      }

      await this.prisma.analysis.update({
        where: { participantId },
        data: data as any,
      });
    } catch (e: any) {
      this.logger.warn(
        `Could not update Analysis scores for participantId=${participantId}: ${e.message}`,
      );
    }
  }

  /**
   * Orchestrates the CQS calculation for a participant in a session.
   * Writes absolute session scores to Analysis (feedback UI) and applies
   * bounded profile deltas via Score Authority (once per session/user).
   */
  async processCallQualityScore(
    sessionId: string,
    userId: string,
    participantId: string,
    transcript: string,
    azureResults: any[],
    callDurationSeconds: number,
    userSpokeSeconds: number,
    source: 'call' | 'maya' = 'call',
    sessionEnrichment?: SessionEnrichment,
  ) {
    this.logger.log(
      `[PHASE 2] Processing CQS for userId=${userId} sessionId=${sessionId}`,
    );

    try {
      const existing = await this.prisma.callQualityScore.findFirst({
        where: { sessionId, userId },
        orderBy: { computedAt: 'desc' },
      });

      const userTurns = transcript
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const turns = userTurns.length > 0 ? userTurns : [transcript].filter(Boolean);
      const transcriptWordCount = ScoringService.countTranscriptWords(turns);
      const pronunciationIssueCount =
        await this.countPronunciationIssues(participantId);
      const scoreOptions = { pronunciationIssueCount, transcriptWordCount };

      // Idempotent: if CQS already ran, refresh Analysis only (no double profile deltas).
      if (existing) {
        const incomingAzure = azureResults ?? [];
        const preserveExistingPa =
          incomingAzure.length === 0 &&
          ScoringService.cqsRowHasPaWordMeasurement(existing);
        const cqsData = preserveExistingPa
          ? null
          : await this.brain.computeCQS({
              user_turns:
                turns.length > 0 ? turns : [transcript || '(no speech)'],
              full_transcript: transcript || '',
              azure_results: incomingAzure,
              call_duration_seconds: callDurationSeconds,
              user_spoke_seconds: userSpokeSeconds,
            });
        if (preserveExistingPa) {
          this.logger.log(
            `[CQS IDEMPOTENT] Preserving existing PA (pqs=${existing.pqs}) session=${sessionId} user=${userId}`,
          );
        }
        let refreshed: SessionScorePayload;
        if (cqsData) {
          refreshed = this.buildSessionScoresFromCqs(
            cqsData.breakdown ?? {},
            Number(cqsData.cqs ?? existing.cqs),
            turns,
            scoreOptions,
          );
        } else {
          // Rebuilding from the stored CQS row, which does NOT persist the
          // grammar pillar. Carry forward a previously LLM-measured grammar from
          // the existing Analysis so an idempotent refresh doesn't silently flip
          // a real grammar score to not_measured. Only stays not_measured if it
          // was never measured to begin with.
          const prior = await this.prisma.analysis.findUnique({
            where: { participantId },
            select: { scores: true },
          });
          const priorScores = (prior?.scores ?? {}) as Record<string, any>;
          const priorGrammar = Number(priorScores.grammar);
          const grammarKnown =
            priorScores.grammarMeasured === true &&
            Number.isFinite(priorGrammar);
          refreshed = this.buildSessionScoresFromCqs(
            {
              pqs: existing.pqs,
              ds: existing.depthScore,
              cs: existing.complexityScore,
              es: existing.engagementScore,
              grammar_signal: grammarKnown ? priorGrammar : null,
              grammar_measured: grammarKnown,
            },
            existing.cqs,
            turns,
            scoreOptions,
          );
        }
        const cefr = deriveCefrFromOverall(refreshed.overall_score);
        await this.writeAnalysisScores(
          participantId,
          refreshed,
          cefr,
          this.fluencyMetaFromBreakdown(cqsData?.breakdown, sessionEnrichment),
        );
        this.logger.log(
          `[CQS IDEMPOTENT] session=${sessionId} user=${userId} overall=${refreshed.overall_score} source=cqs`,
        );
        return existing;
      }

      const cqsData = await this.brain.computeCQS({
        user_turns: turns.length > 0 ? turns : [transcript || '(no speech)'],
        full_transcript: transcript || '',
        azure_results: azureResults ?? [],
        call_duration_seconds: Math.max(0, callDurationSeconds),
        user_spoke_seconds: Math.max(0, userSpokeSeconds),
      });

      if (!cqsData) {
        this.logger.warn(
          `Failed to get CQS from AI engine session=${sessionId} user=${userId}`,
        );
        // Last-resort transcript-only scores — still not placeholder 50s.
        // AI engine is fully down, so grammar CANNOT be graded: mark it
        // not_measured (grammar_signal=null) rather than fabricating a number.
        const fallback = this.buildSessionScoresFromCqs(
          {
            pqs: 0,
            ds: 0,
            cs: 0,
            es: 0,
            grammar_signal: null,
            grammar_measured: false,
            fluency_signal: 0,
          },
          0,
          turns,
          scoreOptions,
        );
        // Force text estimates for the pillars we CAN estimate (delivery/vocab).
        const textFluency = ScoringService.estimateFluencyFromText(turns);
        fallback.fluency = textFluency;
        fallback.fluency_score = textFluency;
        fallback.vocabulary = clampScore(textFluency * 0.9);
        fallback.vocabulary_score = fallback.vocabulary;
        // Overall from measured pillars only (grammar excluded).
        fallback.overall_score = clampScore(
          Math.round(
            (textFluency * 0.25 + fallback.vocabulary * 0.18) / (0.25 + 0.18),
          ),
        );
        fallback.overall = fallback.overall_score;
        await this.writeAnalysisScores(
          participantId,
          fallback,
          deriveCefrFromOverall(fallback.overall_score),
          this.fluencyMetaFromBreakdown(undefined, sessionEnrichment),
        );
        return null;
      }

      const cqs = Number(cqsData.cqs ?? 0);
      const breakdown = cqsData.breakdown ?? {};
      const sessionScores = this.buildSessionScoresFromCqs(
        breakdown,
        cqs,
        turns,
        scoreOptions,
      );

      const pqs =
        typeof breakdown.pqs === 'object'
          ? Number(breakdown.pqs?.pqs ?? 0)
          : Number(breakdown.pqs ?? 0);
      const ds = Number(breakdown.ds ?? 0);
      const fluencySignal = sessionScores.fluency;
      const grammarSignal = sessionScores.grammar;
      const vocabularySignal = sessionScores.vocabulary;

      const baseDelta =
        callDurationSeconds < 600
          ? 0.8
          : callDurationSeconds < 1200
            ? 1.5
            : callDurationSeconds < 1800
              ? 2.0
              : 2.5;

      const metrics = await this.progress.getDetailedMetrics(userId);
      const current = metrics.current;

      const computeDelta = (
        currentScore: number,
        sessionSignal: number,
        pillar: string,
      ): number => {
        if (sessionSignal <= 0 && pillar === 'pronunciation') return 0;
        const qualityMultiplier = 0.3 + (cqs / 100) * 1.0;
        const dampingFactor = 1 - (currentScore / 100) * 0.4;
        const direction = sessionSignal > currentScore ? 1 : -1;
        const pillarAmplifier = pillar === 'pronunciation' ? 1.2 : 1.0;
        const raw =
          direction *
          baseDelta *
          qualityMultiplier *
          dampingFactor *
          pillarAmplifier;
        return Math.max(-currentScore, Math.min(100 - currentScore, raw));
      };

      const pronunciationDelta = sessionScores.pronunciationMeasured
        ? computeDelta(current.pronunciation || 0, pqs, 'pronunciation')
        : 0;
      const fluencyDelta = computeDelta(
        current.fluency || 0,
        fluencySignal,
        'fluency',
      );
      const grammarDelta = computeDelta(
        current.grammar || 0,
        grammarSignal,
        'grammar',
      );
      const vocabularyDelta = computeDelta(
        current.vocabulary || 0,
        vocabularySignal,
        'vocabulary',
      );
      const comprehensionDelta = 0;

      const cqsRecord = await this.prisma.callQualityScore.create({
        data: {
          sessionId,
          userId,
          cqs,
          pqs,
          depthScore: ds,
          complexityScore: Number(breakdown.cs ?? 0),
          engagementScore: Number(breakdown.es ?? 0),
          pronunciationDelta,
          fluencyDelta,
          grammarDelta,
          vocabularyDelta,
          comprehensionDelta,
          phaseComputed: 'phase_2',
        },
      });

      const cefr = deriveCefrFromOverall(sessionScores.overall_score);
      await this.writeAnalysisScores(
        participantId,
        sessionScores,
        cefr,
        this.fluencyMetaFromBreakdown(breakdown, sessionEnrichment),
      );

      if (this.scoreAuthority.isEnabledForUser(userId)) {
        await this.scoreAuthority.applySessionDeltas(
          userId,
          {
            pronunciation: pronunciationDelta,
            fluency: fluencyDelta,
            grammar: grammarDelta,
            vocabulary: vocabularyDelta,
            comprehension: comprehensionDelta,
          },
          source === 'maya' ? 'maya_delta' : 'call_delta',
          sessionId,
        );
      } else {
        await this.progress.applyPillarDeltas(userId, {
          pronunciation: pronunciationDelta,
          fluency: fluencyDelta,
          grammar: grammarDelta,
          vocabulary: vocabularyDelta,
          comprehension: comprehensionDelta,
        });
      }

      this.logger.log(
        `[CQS SUCCESS] session=${sessionId} user=${userId} ` +
          `overall=${sessionScores.overall_score} cqs=${cqs} pqs=${pqs.toFixed(1)} ` +
          `fluency=${fluencySignal} grammar=${grammarSignal} vocab=${vocabularySignal} ` +
          `pronMeasured=${sessionScores.pronunciationMeasured} ` +
          `deltas: pron=${pronunciationDelta.toFixed(3)} flu=${fluencyDelta.toFixed(3)} ` +
          `gram=${grammarDelta.toFixed(3)} voc=${vocabularyDelta.toFixed(3)}`,
      );
      return cqsRecord;
    } catch (error: any) {
      this.logger.error(
        `[PHASE 2 ERROR] userId=${userId}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }
}
