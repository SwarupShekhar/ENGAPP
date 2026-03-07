import { OnQueueFailed, OnQueueStalled, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AssessmentService } from '../assessment/assessment.service';
import { TasksService } from '../tasks/tasks.service';
import { SessionHandlerService } from '../home/services/session-handler.service';
import { BrainService } from '../brain/brain.service';
import { PronunciationService } from '../pronunciation/pronunciation.service';
import { PronunciationScorerService } from '../pronunciation/pronunciation-scorer.service';

@Processor('sessions')
export class SessionsProcessor {
  private readonly logger = new Logger(SessionsProcessor.name);

  constructor(
    private prisma: PrismaService,
    private assessmentService: AssessmentService,
    private tasksService: TasksService,
    private sessionHandlerService: SessionHandlerService,
    private brainService: BrainService,
    private pronunciationService: PronunciationService,
    private pronunciationScorerService: PronunciationScorerService,
  ) {}

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Job ${job.id} (session ${job.data?.sessionId}) FAILED after ${job.attemptsMade} attempts: ${error.message}`,
    );
  }

  @OnQueueStalled()
  onStalled(job: Job) {
    this.logger.warn(
      `Job ${job.id} (session ${job.data?.sessionId}) STALLED — will be retried by Bull`,
    );
  }

  @Process('process-session')
  async handleProcessSession(job: Job<any>) {
    const { sessionId, audioUrls } = job.data;
    this.logger.log(
      `Processing session ${sessionId} in background (started)...`,
    );

    // Wait 5 seconds to allow partner's endSession call to potentially provide a merged transcript
    await new Promise((resolve) => setTimeout(resolve, 5000));

    try {
      // 1) Update session status to PROCESSING
      await this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: { status: 'PROCESSING' },
      });

      // Try to get transcript: favor Feedback table over job data
      const feedback = await this.prisma.feedback.findUnique({
        where: { sessionId },
        select: { transcript: true },
      });

      let transcript = (
        feedback?.transcript ||
        job.data.transcript ||
        ''
      ).trim();

      if (feedback?.transcript) {
        this.logger.log(
          `[SessionsProcessor] Using transcript from Feedback table (${transcript.length} chars)`,
        );
      } else if (job.data.transcript) {
        this.logger.log(
          `[SessionsProcessor] Using transcript from job data (${transcript.length} chars)`,
        );
      } else {
        this.logger.warn(
          `[SessionsProcessor] No transcript found for session ${sessionId}. Waiting 8s for partner submission...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 8000));
        const retryFeedback = await this.prisma.feedback.findUnique({
          where: { sessionId },
          select: { transcript: true },
        });
        transcript = (retryFeedback?.transcript || '').trim();
        if (transcript) {
          this.logger.log(
            `[SessionsProcessor] Using transcript from Feedback (after wait): ${transcript.length} chars`,
          );
        } else {
          this.logger.warn(
            `[SessionsProcessor] No transcript found for session ${sessionId}`,
          );
        }
      }

      // Only short-circuit if truly no transcript exists anywhere
      if (!transcript) {
        this.logger.warn(
          `Short-circuiting session ${sessionId}: No speech detected from any source.`,
        );

        // Look up actual SessionParticipant records (Analysis.participantId → SessionParticipant.id)
        const sessionParticipants =
          await this.prisma.sessionParticipant.findMany({
            where: { sessionId },
            select: { id: true },
          });

        if (sessionParticipants.length > 0) {
          await Promise.all(
            sessionParticipants.map(async (sp) => {
              await this.prisma.analysis.upsert({
                where: {
                  sessionId_participantId: { sessionId, participantId: sp.id },
                },
                create: {
                  sessionId,
                  participantId: sp.id,
                  rawData: { message: 'No speech detected' },
                  scores: {
                    grammar: 0,
                    pronunciation: 0,
                    fluency: 0,
                    vocabulary: 0,
                    overall: 0,
                  },
                  cefrLevel: 'N/A',
                },
                update: {},
              });
            }),
          );
        } else {
          this.logger.warn(
            `Session ${sessionId} has no participants in DB, skipping analysis creation.`,
          );
        }

        await this.prisma.conversationSession.update({
          where: { id: sessionId },
          data: { status: 'COMPLETED' },
        });
        return;
      }

      this.logger.log(
        `[SessionsProcessor] Proceeding with AI analysis for session ${sessionId} (transcript: ${transcript.length} chars)`,
      );

      // 2) Pre-flight: Verify AI engine is reachable before attempting analysis
      const aiStatus = this.brainService.getAiEngineStatus();
      if (!aiStatus.healthy) {
        this.logger.warn(
          `[SessionsProcessor] AI engine was last reported as unhealthy. Running live check...`,
        );
        const isAlive = await this.brainService.checkAiEngineHealth();
        if (!isAlive) {
          this.logger.error(
            `🔴 [SessionsProcessor] AI ENGINE IS DOWN! Session ${sessionId} analysis will likely fail. ` +
              `Start the AI engine: cd backend-ai && uvicorn app.main:app --port 8001`,
          );
          // Still attempt — Bull will retry on failure
        } else {
          this.logger.log(
            `[SessionsProcessor] AI engine is now reachable. Proceeding...`,
          );
        }
      }

      // 3) AI Pipeline - Joint Session Analysis
      await this.assessmentService.analyzeAndStoreJoint(
        sessionId,
        audioUrls,
        transcript,
      );

      // Handle session complete for streaks & achievements
      const sessionData = await this.prisma.conversationSession.findUnique({
        where: { id: sessionId },
        include: {
          participants: {
            include: { analysis: true },
          },
        },
      });

      if (sessionData && sessionData.recordingUrl) {
        const firstParticipant = sessionData.participants?.[0];
        if (firstParticipant) {
          try {
            this.logger.log(
              `[SessionsProcessor] Running pronunciation assessment for session ${sessionId} on ${sessionData.recordingUrl}`,
            );
            const { flagged_errors: flaggedErrors, pronunciation_score: pronScore } =
              await this.pronunciationService.assessFromRecordingUrl(
                firstParticipant.userId,
                sessionData.recordingUrl,
                transcript,
              );

            const firstAnalysis = firstParticipant.analysis;
            let grammar = 0,
              vocabulary = 0,
              fluency = 0,
              overallScore = 0;
            if (firstAnalysis?.scores && typeof firstAnalysis.scores === 'object') {
              const s = firstAnalysis.scores as Record<string, number>;
              grammar = s.grammar ?? s.grammar_score ?? 0;
              vocabulary = s.vocabulary ?? s.vocabulary_score ?? 0;
              fluency = s.fluency ?? s.fluency_score ?? 0;
            }
            const pronFromAi = pronScore?.score ?? 0;
            overallScore = this.pronunciationScorerService.applyPronunciationScore(
              { grammar, vocabulary, fluency, pronunciation: pronFromAi },
              pronFromAi,
            );
            if (pronScore?.cefr_cap) {
              overallScore = this.pronunciationScorerService.applyCEFRCap(
                overallScore,
                pronScore.cefr_cap,
              );
            }

            const cefrFromScore =
              overallScore > 72 ? 'B2' : overallScore > 55 ? 'B1' : overallScore > 35 ? 'A2' : 'A1';

            const roundedOverall = Math.round(overallScore * 10) / 10;
            await this.prisma.conversationSession.update({
              where: { id: sessionId },
              data: {
                summaryJson: {
                  transcript,
                  pronunciation_flagged: flaggedErrors,
                  cefr_score: cefrFromScore,
                  overall_score: roundedOverall,
                  grammar_score: grammar,
                  vocabulary_score: vocabulary,
                  fluency_score: fluency,
                  pronunciation_score: pronFromAi,
                  pronunciation_cefr_cap: pronScore?.cefr_cap ?? null,
                  pronunciation_cap_reason: pronScore?.cap_reason ?? null,
                  dominant_pronunciation_errors: pronScore?.dominant_errors ?? [],
                  grammar_errors: (firstAnalysis?.rawData as any)?.aiFeedback
                    ? []
                    : undefined,
                },
              },
            });

            if (firstAnalysis?.id) {
              const existingScores =
                (firstAnalysis.scores as Record<string, number>) || {};
              await this.prisma.analysis.update({
                where: { id: firstAnalysis.id },
                data: {
                  scores: {
                    ...existingScores,
                    grammar,
                    vocabulary,
                    fluency,
                    pronunciation: pronFromAi,
                    overall: roundedOverall,
                  },
                  cefrLevel: cefrFromScore,
                },
              });
            }
          } catch (pronunErr) {
            this.logger.error(
              `[SessionsProcessor] Pronunciation assessment failed for session ${sessionId}: ${pronunErr.message}`,
            );
          }
        }
      }

      if (sessionData && sessionData.participants) {
        for (const sp of sessionData.participants) {
          const analysis = sp.analysis;
          let fluency = 0,
            grammar = 0,
            vocabulary = 0,
            pronunciation = 0;
          if (
            analysis &&
            analysis.scores &&
            typeof analysis.scores === 'object'
          ) {
            const scores = analysis.scores as any;
            fluency = scores.fluency || scores.fluency_score || 0;
            grammar = scores.grammar || scores.grammar_score || 0;
            vocabulary = scores.vocabulary || scores.vocabulary_score || 0;
            pronunciation =
              scores.pronunciation || scores.pronunciation_score || 0;
          }
          await this.sessionHandlerService.handleSessionComplete(sp.userId, {
            type: 'p2p',
            durationSeconds: sessionData.duration || 600,
            skills: {
              fluency,
              grammar,
              vocabulary,
              pronunciation,
            },
          });
        }
      }

      // 4) Mark session as COMPLETED (analyzeAndStoreJoint already updates status, but ensure idempotency)
      await this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: { status: 'COMPLETED' },
      });

      this.logger.log(
        `Session ${sessionId} processing completed successfully.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process session ${sessionId}: ${error.message}`,
      );
      require('fs').appendFileSync(
        'debug_session.log',
        `[SessionsProcessor] Error processing session ${sessionId}: ${error.message}\nStack: ${error.stack}\n`,
      );

      // Mark as ANALYSIS_FAILED to allow manual retry or debugging
      await this.prisma.conversationSession
        .update({
          where: { id: sessionId },
          data: { status: 'ANALYSIS_FAILED' },
        })
        .catch(() => {});

      throw error; // Let Bull handle the retry
    }
  }
}
