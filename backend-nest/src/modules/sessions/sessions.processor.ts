import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AssessmentService } from '../assessment/assessment.service';
import { TasksService } from '../tasks/tasks.service';

@Processor('sessions')
export class SessionsProcessor {
  private readonly logger = new Logger(SessionsProcessor.name);

  constructor(
    private prisma: PrismaService,
    private assessmentService: AssessmentService,
    private tasksService: TasksService,
  ) {}

  @Process('process-session')
  async handleProcessSession(job: Job<any>) {
    const { sessionId, audioUrls, participantIds } = job.data;
    this.logger.log(
      `Processing session ${sessionId} in background (started)...`,
    );

    try {
      // 1) Update session status to PROCESSING
      await this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: { status: 'PROCESSING' },
      });

      // Short-circuit if transcript is empty (silent call)
      const transcript = job.data.transcript || '';
      if (!transcript.trim()) {
        this.logger.log(
          `Short-circuiting session ${sessionId}: No speech detected.`,
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

      // 2) AI Pipeline - Joint Session Analysis
      await this.assessmentService.analyzeAndStoreJoint(
        sessionId,
        audioUrls,
        transcript,
      );

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
