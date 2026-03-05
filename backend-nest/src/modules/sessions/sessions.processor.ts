import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AssessmentService } from '../assessment/assessment.service';
import { TasksService } from '../tasks/tasks.service';
import { SessionHandlerService } from '../home/services/session-handler.service';
import { BrainService } from '../brain/brain.service';

@Processor('sessions')
export class SessionsProcessor {
  private readonly logger = new Logger(SessionsProcessor.name);

  constructor(
    private prisma: PrismaService,
    private assessmentService: AssessmentService,
    private tasksService: TasksService,
    private sessionHandlerService: SessionHandlerService,
    private brainService: BrainService,
  ) {}

  @Process('process-session')
  async handleProcessSession(job: Job<any>) {
    const { sessionId, audioUrls } = job.data;
    this.logger.log(
      `Processing session ${sessionId} in background (started)...`,
    );

    try {
      // 1) Update session status to PROCESSING
      await this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: { status: 'PROCESSING' },
      });

      // Try to get transcript: first from job data, then from Feedback table
      let transcript = (job.data.transcript || '').trim();

      if (!transcript) {
        this.logger.log(
          `[SessionsProcessor] Job transcript empty for ${sessionId}, checking Feedback table...`,
        );
        const feedback = await this.prisma.feedback.findUnique({
          where: { sessionId },
          select: { transcript: true },
        });
        transcript = (feedback?.transcript || '').trim();
        if (transcript) {
          this.logger.log(
            `[SessionsProcessor] Retrieved transcript from Feedback table (${transcript.length} chars)`,
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
            fluency = scores.fluency || 0;
            grammar = scores.grammar || 0;
            vocabulary = scores.vocabulary || 0;
            pronunciation = scores.pronunciation || 0;
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

      // 3) Mark session as COMPLETED (analyzeAndStoreJoint already updates status, but ensure idempotency)
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
