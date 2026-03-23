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
    this.logger.log(`Processing CQS for userId=${userId} sessionId=${sessionId}`);

    try {
      // 1. Get user turns (assuming transcript is single-speaker or we filter it)
      // For now, treat the entire transcript as user turns (since it comes from participant-track egress)
      const userTurns = [transcript]; 

      // 2. Call backend-ai
      const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8001';
      const cqsData = await this.brain.computeCQS({
        user_turns: userTurns,
        full_transcript: transcript,
        azure_results: azureResults,
        call_duration_seconds: callDurationSeconds,
        user_spoke_seconds: userSpokeSeconds,
      });

      if (!cqsData) {
        this.logger.warn('Failed to get CQS from AI engine');
        return null;
      }

      // 3. Get current user pillar scores for delta calculation
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { level: true },
      });

      const currentMetrics = await this.progress.getDetailedMetrics(userId);
      const currentScores = currentMetrics.current;

      const dampingFactor = 0.40;
      const cefrMultiplier = this.getCefrMultiplier(user?.level || 'A1');

      // Formula: P_delta = (CQS_pillar - Current_Pillar_Score) * damping_factor * multiplier
      const calculateDelta = (cqsPillar: number, currentPillar: number) => {
        return (cqsPillar - currentPillar) * dampingFactor * cefrMultiplier;
      };

      const pronunciationDelta = calculateDelta(cqsData.breakdown.pqs, currentScores.pronunciation);
      const fluencyDelta = calculateDelta(cqsData.breakdown.pqs, currentScores.fluency); // Spec says PQS affects Fluency too
      const grammarDelta = calculateDelta(cqsData.breakdown.ds, currentScores.grammar); // Depth affects Grammar/Vocab
      const vocabularyDelta = calculateDelta(cqsData.breakdown.ds, currentScores.vocabulary);
      const comprehensionDelta = calculateDelta(cqsData.breakdown.cs, currentScores.comprehension);

      // 4. Persist CQS
      const cqsRecord = await this.prisma.callQualityScore.create({
        data: {
          sessionId,
          userId,
          cqs: cqsData.cqs,
          pqs: cqsData.breakdown.pqs,
          depthScore: cqsData.breakdown.ds,
          complexityScore: cqsData.breakdown.cs,
          engagementScore: cqsData.breakdown.es,
          pronunciationDelta,
          fluencyDelta,
          grammarDelta,
          vocabularyDelta,
          comprehensionDelta,
        },
      });

      // 5. Update user topic scores / weaknesses (Integration with existing systems)
      // This is usually handled by WeaknessService, but we can also record these deltas directly
      // for the 5 core pillars if they are stored in a specific table.
      // For now, we'll log them as "progressed".

      this.logger.log(`CQS processed: ${cqsData.cqs}. pronunciationDelta=${pronunciationDelta.toFixed(2)}`);

      return cqsRecord;
    } catch (error) {
      this.logger.error(`Error processing CQS: ${error.message}`, error.stack);
      return null;
    }
  }

  private getCefrMultiplier(level: string): number {
    const l = level.toUpperCase();
    if (l.startsWith('A1')) return 1.25;
    if (l.startsWith('A2')) return 1.00;
    if (l.startsWith('B1')) return 0.75;
    return 0.50; // Higher levels grow slower
  }
}
