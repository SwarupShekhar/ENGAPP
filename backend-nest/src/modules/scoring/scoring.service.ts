import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BrainService } from '../brain/brain.service';
import { ProgressService } from '../progress/progress.service';
import { ScoreAuthorityService } from '../score-authority/score-authority.service';
import {
  clampScore,
  computeOverall,
  deriveCefrFromOverall,
  type PillarScores,
} from '../score-authority/score-authority.formulas';

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

  /**
   * Build absolute session pillar scores from CQS breakdown.
   * Never returns the all-50 placeholder pattern.
   */
  buildSessionScoresFromCqs(
    breakdown: Record<string, any>,
    cqs: number,
    userTurns: string[],
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
    const pronunciationMeasured = wordCount > 0 && pqs > 0;

    let fluency = Number(
      breakdown.fluency_signal ?? pqsRaw?.mean_fluency ?? 0,
    );
    if (!Number.isFinite(fluency) || fluency <= 0) {
      fluency = ScoringService.estimateFluencyFromText(userTurns);
    }

    let grammar = Number(breakdown.grammar_signal ?? 0);
    if (!Number.isFinite(grammar) || grammar <= 0) {
      // Depth/complexity still reflect language quality when grammar signal is empty.
      grammar = clampScore(
        (Number(breakdown.ds ?? 0) * 0.5 + Number(breakdown.cs ?? 0) * 0.5) ||
          ScoringService.estimateFluencyFromText(userTurns),
      );
    }

    const ds = Number(breakdown.ds ?? 0);
    let vocabulary = clampScore(ds * 0.8);
    if (vocabulary <= 0) {
      const words = userTurns.join(' ').match(/\b[a-zA-Z]+\b/g) ?? [];
      const unique = new Set(words.map((w) => w.toLowerCase()));
      vocabulary =
        words.length === 0
          ? 0
          : clampScore(Math.min(80, (unique.size / words.length) * 100));
    }

    let pronunciation = pronunciationMeasured ? clampScore(pqs) : 0;
    // Without PA, do not invent a 50 — leave unmeasured and weight overall from available pillars.
    const pillars: PillarScores = {
      pronunciation: pronunciationMeasured ? pronunciation : 0,
      fluency: clampScore(fluency),
      grammar: clampScore(grammar),
      vocabulary: clampScore(vocabulary),
      comprehension: 0,
    };

    let overall: number;
    if (pronunciationMeasured) {
      overall = computeOverall(pillars);
    } else {
      // Renormalize without pronunciation + comprehension (weights 0.22 + 0.13).
      const active =
        pillars.fluency * 0.25 +
        pillars.grammar * 0.22 +
        pillars.vocabulary * 0.18;
      const weightSum = 0.25 + 0.22 + 0.18;
      overall = Math.round(active / weightSum);
      // Prefer CQS when it has real text signal and PA was absent.
      if (cqs > 0) {
        overall = clampScore(Math.round(overall * 0.55 + cqs * 0.45));
      }
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
    };
  }

  private fluencyMetaFromBreakdown(breakdown: Record<string, unknown> | undefined) {
    const fb = breakdown?.fluency_breakdown as Record<string, unknown> | undefined;
    if (!fb) return undefined;
    return {
      fluencyBreakdown: fb,
      hesitationMarkers: (fb.hesitation_markers as Record<string, unknown>) ?? {
        filler_words_count: fb.fillerCount ?? 0,
        pauses_count: fb.pause_count ?? 0,
        top_fillers: fb.topFillers ?? [],
        wpm: fb.wpm ?? 0,
      },
      wpm: Number(fb.wpm ?? 0),
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
    },
  ): Promise<void> {
    try {
      const data: Record<string, unknown> = {
        scores: scores as any,
        cefrLevel,
      };

      if (fluencyMeta?.fluencyBreakdown || fluencyMeta?.hesitationMarkers || fluencyMeta?.wpm != null) {
        const existing = await this.prisma.analysis.findUnique({
          where: { participantId },
          select: { rawData: true },
        });
        const raw = (existing?.rawData as Record<string, unknown>) || {};
        const azureEvidence = {
          ...((raw.azureEvidence as Record<string, unknown>) || {}),
          wpm: fluencyMeta.wpm ?? (fluencyMeta.fluencyBreakdown as any)?.wpm,
          fluencyBreakdown: fluencyMeta.fluencyBreakdown,
        };
        data.rawData = {
          ...raw,
          azureEvidence,
          fluencyBreakdown: fluencyMeta.fluencyBreakdown,
        } as any;
        if (fluencyMeta.hesitationMarkers) {
          data.hesitationMarkers = fluencyMeta.hesitationMarkers as any;
        }
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

      // Idempotent: if CQS already ran, refresh Analysis only (no double profile deltas).
      if (existing) {
        const cqsData = await this.brain.computeCQS({
          user_turns: turns.length > 0 ? turns : [transcript || '(no speech)'],
          full_transcript: transcript || '',
          azure_results: azureResults ?? [],
          call_duration_seconds: callDurationSeconds,
          user_spoke_seconds: userSpokeSeconds,
        });
        const refreshed = cqsData
          ? this.buildSessionScoresFromCqs(
              cqsData.breakdown ?? {},
              Number(cqsData.cqs ?? existing.cqs),
              turns,
            )
          : this.buildSessionScoresFromCqs(
              {
                pqs: existing.pqs,
                ds: existing.depthScore,
                cs: existing.complexityScore,
                es: existing.engagementScore,
              },
              existing.cqs,
              turns,
            );
        const cefr = deriveCefrFromOverall(refreshed.overall_score);
        await this.writeAnalysisScores(
          participantId,
          refreshed,
          cefr,
          this.fluencyMetaFromBreakdown(cqsData?.breakdown),
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
        const fallback = this.buildSessionScoresFromCqs(
          {
            pqs: 0,
            ds: 0,
            cs: 0,
            es: 0,
            grammar_signal: 0,
            fluency_signal: 0,
          },
          0,
          turns,
        );
        // Force text estimates into fallback path
        const textFluency = ScoringService.estimateFluencyFromText(turns);
        fallback.fluency = textFluency;
        fallback.fluency_score = textFluency;
        fallback.grammar = textFluency;
        fallback.grammar_score = textFluency;
        fallback.vocabulary = clampScore(textFluency * 0.9);
        fallback.vocabulary_score = fallback.vocabulary;
        fallback.overall_score = clampScore(
          textFluency * 0.4 + fallback.grammar * 0.35 + fallback.vocabulary * 0.25,
        );
        fallback.overall = fallback.overall_score;
        await this.writeAnalysisScores(
          participantId,
          fallback,
          deriveCefrFromOverall(fallback.overall_score),
        );
        return null;
      }

      const cqs = Number(cqsData.cqs ?? 0);
      const breakdown = cqsData.breakdown ?? {};
      const sessionScores = this.buildSessionScoresFromCqs(
        breakdown,
        cqs,
        turns,
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
        this.fluencyMetaFromBreakdown(breakdown),
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
