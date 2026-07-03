import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BrainService } from '../brain/brain.service';
import { ProgressService } from '../progress/progress.service';
import { ScoreAuthorityService } from '../score-authority/score-authority.service';

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brain: BrainService,
    private readonly progress: ProgressService,
    private readonly scoreAuthority: ScoreAuthorityService,
  ) {}

  /**
   * Orchestrates the CQS calculation for a participant in a session.
   * 1. Gathers transcript turns and Azure results.
   * 2. Calls backend-ai to compute CQS and dimension breakdown.
   * 3. Calculates pillar deltas based on spec formula.
   * 4. Persists scores and updates user progress.
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
    this.logger.log(`[PHASE 2] Processing CQS for userId=${userId} sessionId=${sessionId}`);

    try {
      // Step 1 — Call /scoring/cqs
      const userTurns = transcript
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const cqsData = await this.brain.computeCQS({
        user_turns: userTurns.length > 0 ? userTurns : [transcript],
        full_transcript: transcript,
        azure_results: azureResults,
        call_duration_seconds: callDurationSeconds,
        user_spoke_seconds: userSpokeSeconds,
      });

      if (!cqsData) {
        this.logger.warn('Failed to get CQS from AI engine');
        return null;
      }

      // Step 2 — Extract signals from breakdown
      const cqs = cqsData.cqs;
      const breakdown = cqsData.breakdown;

      const pqs = typeof breakdown.pqs === 'object' ? breakdown.pqs.pqs : breakdown.pqs;
      const ds = breakdown.ds;
      const fluencySignal = breakdown.fluency_signal ?? breakdown.pqs?.mean_fluency ?? 0;
      const grammarSignal = breakdown.grammar_signal ?? 0;
      const vocabularySignal = ds * 0.8;
      // comprehensionDelta stays 0 — deferred per spec

      // Step 3 — Base delta from call duration
      const baseDelta =
        callDurationSeconds < 600  ? 0.8 :
        callDurationSeconds < 1200 ? 1.5 :
        callDurationSeconds < 1800 ? 2.0 : 2.5;

      // Step 4 — Fetch current pillar scores
      const metrics = await this.progress.getDetailedMetrics(userId);
      const current = metrics.current;

      // Step 5 — Delta helper
      const computeDelta = (
        currentScore: number,
        sessionSignal: number,
        pillar: string,
      ): number => {
        const qualityMultiplier = 0.3 + (cqs / 100) * 1.0;
        const dampingFactor = 1 - (currentScore / 100) * 0.4;
        const direction = sessionSignal > currentScore ? 1 : -1;
        const pillarAmplifier = pillar === 'pronunciation' ? 1.2 : 1.0;

        const raw = direction * baseDelta * qualityMultiplier * dampingFactor * pillarAmplifier;
        return Math.max(-currentScore, Math.min(100 - currentScore, raw));
      };

      // Step 6 — Compute all 5 deltas
      const pronunciationDelta = computeDelta(current.pronunciation || 0, pqs, 'pronunciation');
      const fluencyDelta       = computeDelta(current.fluency || 0, fluencySignal, 'fluency');
      const grammarDelta       = computeDelta(current.grammar || 0, grammarSignal, 'grammar');
      const vocabularyDelta    = computeDelta(current.vocabulary || 0, vocabularySignal, 'vocabulary');
      const comprehensionDelta = 0; // deferred

      // Step 7 — Persist CQS record with real values
      const cqsRecord = await this.prisma.callQualityScore.create({
        data: {
          sessionId,
          userId,
          cqs,
          pqs,
          depthScore: ds,
          complexityScore: breakdown.cs,
          engagementScore: breakdown.es,
          pronunciationDelta,
          fluencyDelta,
          grammarDelta,
          vocabularyDelta,
          comprehensionDelta,
          phaseComputed: 'phase_2',
        },
      });

      // Step 8 — Update Analysis table with real values
      try {
        await this.prisma.analysis.update({
          where: { participantId },
          data: {
            scores: {
              pronunciation: Math.round(pqs),
              fluency: Math.round(fluencySignal),
              grammar: Math.round(grammarSignal),
              vocabulary: Math.round(vocabularySignal),
            } as any,
          },
        });
      } catch (e) {
        this.logger.warn(
          `Could not update Analysis scores for participantId=${participantId}: ${e.message}`,
        );
      }

      // Step 9 — Apply all deltas through score authority (or legacy progress path)
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
        `[CQS SUCCESS] cqs=${cqs} pqs=${pqs.toFixed(1)} ` +
        `fluency=${fluencySignal.toFixed(1)} grammar=${grammarSignal.toFixed(1)} ` +
        `vocab=${vocabularySignal.toFixed(1)} ` +
        `deltas: pron=${pronunciationDelta.toFixed(3)} flu=${fluencyDelta.toFixed(3)} ` +
        `gram=${grammarDelta.toFixed(3)} voc=${vocabularyDelta.toFixed(3)}`
      );
      return cqsRecord;

    } catch (error) {
      this.logger.error(`[PHASE 2 ERROR] userId=${userId}: ${error.message}`, error.stack);
      return null;
    }
  }

}
