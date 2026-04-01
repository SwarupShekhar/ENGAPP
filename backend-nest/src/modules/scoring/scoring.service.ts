import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BrainService } from '../brain/brain.service';
import { ProgressService } from '../progress/progress.service';

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brain: BrainService,
    private readonly progress: ProgressService,
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
  ) {
    this.logger.log(`[PHASE 2] Processing PQS for userId=${userId} sessionId=${sessionId}`);

    try {
      // 1. Call backend-ai PQS endpoint
      const pqsData = await this.brain.computePQS({
        session_id: sessionId,
        user_id: userId,
        pronunciation_result: azureResults,
      });

      if (!pqsData) {
        this.logger.warn('Failed to get PQS from AI engine');
        return null;
      }

      // 2. Get current user pillar scores
      const metrics = await this.progress.getDetailedMetrics(userId);
      const currentPronunciation = metrics.current.pronunciation || 0;

      // 3. Calculate pronunciation delta based on Phase 2 spec
      const baseDelta =
        callDurationSeconds < 600
          ? 0.8
          : callDurationSeconds < 1200
            ? 1.5
            : callDurationSeconds < 1800
              ? 2.0
              : 2.5;
      const dampingFactor = 1 - (currentPronunciation / 100) * 0.4;
      const qualityMultiplier = 0.3 + (pqsData.pqs / 100) * 1.0;
      const direction = pqsData.pqs > currentPronunciation ? 1 : -1;
      const pillarAmplifier = 1.2;

      const rawPronunciationDelta =
        direction *
        baseDelta *
        qualityMultiplier *
        dampingFactor *
        pillarAmplifier;

      const pronunciationDelta = Math.max(
        -currentPronunciation,
        Math.min(100 - currentPronunciation, rawPronunciationDelta),
      );

      // 4. Persist CQS record
      const cqsRecord = await this.prisma.callQualityScore.create({
        data: {
          sessionId,
          userId,
          cqs: pqsData.pqs, // Overall CQS is just PQS in Phase 2
          pqs: pqsData.pqs,
          depthScore: 0,
          complexityScore: 0,
          engagementScore: 0,
          pronunciationDelta,
          fluencyDelta: 0,
          grammarDelta: 0,
          vocabularyDelta: 0,
          comprehensionDelta: 0,
          phaseComputed: 'phase_2',
        },
      });

      // 4.5 Update Analysis table so Home screen shows correct scores
      try {
        await this.prisma.analysis.update({
          where: { participantId },
          data: {
            scores: {
              pronunciation: Math.round(pqsData.pqs),
              fluency: Math.round(pqsData.mean_fluency),
              grammar: 0,
              vocabulary: 0,
            } as any,
          },
        });
      } catch (e) {
        this.logger.warn(
          `Could not update Analysis scores for participantId=${participantId}: ${e.message}`,
        );
      }

      // 5. Apply progress authoritative
      await this.progress.applyPillarDeltas(userId, {
        pronunciation: pronunciationDelta,
        fluency: 0,
        grammar: 0,
        vocabulary: 0,
        comprehension: 0,
      });

      this.logger.log(
        `[PHASE 2 SUCCESS] pqs=${pqsData.pqs}, delta=${pronunciationDelta.toFixed(4)}`,
      );
      return cqsRecord;

    } catch (error) {
      this.logger.error(`[PHASE 2 ERROR] userId=${userId}: ${error.message}`, error.stack);
      return null;
    }
  }

}
