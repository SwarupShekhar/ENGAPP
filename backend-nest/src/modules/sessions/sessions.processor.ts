import { InjectQueue } from '@nestjs/bull';
import {
  OnQueueFailed,
  OnQueueStalled,
  Process,
  Processor,
} from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
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
    @InjectQueue('sessions') private sessionsQueue: Queue,
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

    const WAIT_FOR_PARTNER_MS = 10000; // 10s — slow networks can take 15–20s to complete endSession
    const MAX_WAIT_ATTEMPTS = 12; // 12 × 10s = 120s total window for second device
    const attempt = (job.data.waitAttempts ?? 0) + 1;

    try {
      await this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: { status: 'PROCESSING' },
      });

      const session = await this.prisma.conversationSession.findUnique({
        where: { id: sessionId },
        include: {
          participants: true,
          feedbacks: { include: { participant: true } },
        },
      });

      if (!session) {
        this.logger.warn(`Session ${sessionId} not found.`);
        return;
      }

      // Wait for both participants to submit before analyzing (with ceiling to avoid infinite re-queue)
      if (session.feedbacks.length < session.participants.length) {
        if (attempt >= MAX_WAIT_ATTEMPTS) {
          this.logger.warn(
            `[SessionsProcessor] Session ${sessionId}: only ${session.feedbacks.length}/${session.participants.length} transcripts after ${MAX_WAIT_ATTEMPTS} attempts, proceeding anyway.`,
          );
        } else {
          this.logger.log(
            `[SessionsProcessor] Session ${sessionId}: only ${session.feedbacks.length}/${session.participants.length} feedbacks (attempt ${attempt}/${MAX_WAIT_ATTEMPTS}). Re-queuing in ${WAIT_FOR_PARTNER_MS}ms.`,
          );
          await this.sessionsQueue.add(
            'process-session',
            {
              sessionId,
              audioUrls: audioUrls || {},
              participantIds: session.participants.map((p) => p.userId),
              waitAttempts: attempt,
            },
            {
              delay: WAIT_FOR_PARTNER_MS,
              attempts: 5,
              backoff: { type: 'exponential', delay: 2000 },
              jobId: `process-session-${sessionId}-wait-${attempt}`,
            },
          );
          return;
        }
      }

      // Merge segments from each participant's feedback (each device sent only its own speech)
      type Seg = { speaker_id: string; text: string; timestamp?: number };
      const segments: Seg[] = session.feedbacks.flatMap((fb) => {
        const arr = Array.isArray(fb.transcript)
          ? (fb.transcript as Seg[])
          : [];
        return arr.map((t) => ({
          speaker_id: fb.participant.userId,
          text: typeof t.text === 'string' ? t.text : String(t.text ?? ''),
          timestamp: typeof t.timestamp === 'number' ? t.timestamp : 0,
        }));
      });
      segments.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

      // Log when one participant sent no segments (explains "errors not caught" / static feedback for that user)
      const segmentCountByUser = session.participants.map((p) => ({
        userId: p.userId,
        count: segments.filter((s) => s.speaker_id === p.userId).length,
      }));
      const emptySpeakers = segmentCountByUser.filter((x) => x.count === 0);
      if (emptySpeakers.length > 0) {
        this.logger.warn(
          `[SessionsProcessor] Session ${sessionId}: ${emptySpeakers.map((x) => x.userId).join(', ')} sent 0 transcript segments. ` +
            `Check in-call STT / transcription; that user will get placeholder analysis and errors may be missed.`,
        );
      }

      const transcriptForLog = segments
        .map((s) => `${s.speaker_id}: ${s.text}`)
        .join('\n');

      if (segments.length === 0) {
        this.logger.warn(
          `Short-circuiting session ${sessionId}: No speech segments from any participant.`,
        );
        for (const sp of session.participants) {
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
        }
        await this.prisma.conversationSession.update({
          where: { id: sessionId },
          data: { status: 'COMPLETED' },
        });
        return;
      }

      this.logger.log(
        `[SessionsProcessor] Proceeding with AI analysis for session ${sessionId} (${segments.length} segments).`,
      );

      const aiStatus = this.brainService.getAiEngineStatus();
      if (!aiStatus.healthy) {
        const isAlive = await this.brainService.checkAiEngineHealth();
        if (!isAlive) {
          this.logger.error(
            `🔴 [SessionsProcessor] AI ENGINE IS DOWN! Session ${sessionId} analysis will likely fail.`,
          );
        } else {
          this.logger.log(
            `[SessionsProcessor] AI engine is now reachable. Proceeding...`,
          );
        }
      }

      await this.assessmentService.analyzeAndStoreJoint(
        sessionId,
        audioUrls || {},
        undefined,
        segments,
      );

      // Silent post-processing: after Analysis/Mistake rows exist, generate LearningTasks.
      // This MUST NOT fail the overall session job; if it errors, we only log.
      // Note: PronunciationIssue rows may be created later by LiveKit webhook; task generation is idempotent
      // and can be re-run safely. We still run here to cover the common case where actionable mistakes exist.
      try {
        for (const participant of session.participants) {
          try {
            await this.tasksService.generateTasksForSession(
              sessionId,
              participant.userId,
            );
          } catch (e: any) {
            this.logger.warn(
              `[SessionsProcessor] Task generation failed (non-fatal) session=${sessionId} user=${participant.userId}: ${e?.message ?? e}`,
            );
          }
        }
      } catch (e: any) {
        this.logger.warn(
          `[SessionsProcessor] Task generation loop failed (non-fatal) session=${sessionId}: ${e?.message ?? e}`,
        );
      }

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
