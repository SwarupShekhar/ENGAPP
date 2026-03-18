import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AzureStorageService } from '../../integrations/azure-storage.service';
import { ReliabilityService } from '../reliability/reliability.service';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private prisma: PrismaService,
    private azureStorage: AzureStorageService,
    private reliabilityService: ReliabilityService,
    @InjectQueue('sessions') private sessionsQueue: Queue,
  ) {}

  async getSessionAnalysis(
    sessionId: string,
    userId: string,
    options?: { retry?: boolean },
  ) {
    this.logger.log(
      `[SessionsService] Requesting analysis for session: ${sessionId}, user: ${userId}`,
    );

    const session = await this.prisma.conversationSession.findUnique({
      where: { id: sessionId },
      include: {
        analyses: {
          include: {
            mistakes: true,
            pronunciationIssues: true,
          },
        },
        participants: {
          include: {
            user: true,
          },
        },
        feedbacks: true,
      },
    });

    if (!session) {
      const sessionCount = await this.prisma.conversationSession.count();
      const latestSession = await this.prisma.conversationSession.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      throw new BadRequestException({
        message: 'Session not found in database',
        debug: {
          requestedSessionId: sessionId,
          requestedUserId: userId,
          totalSessionsInDb: sessionCount,
          latestSessionId: latestSession?.id || 'none',
        },
      });
    }

    // Retry: when client sends retry=1 and session is ANALYSIS_FAILED, re-queue (processor reads from feedbacks)
    const hasEnoughFeedback =
      (session as any).feedbacks?.length >= session.participants.length &&
      (session as any).feedbacks?.some(
        (fb: any) =>
          Array.isArray(fb.transcript) && (fb.transcript as any[]).length > 0,
      );
    if (
      options?.retry &&
      session.status === 'ANALYSIS_FAILED' &&
      hasEnoughFeedback
    ) {
      const participantIds = session.participants.map((p) => p.userId);
      this.logger.log(
        `[SessionsService] Re-queuing analysis for session ${sessionId} (retry requested).`,
      );
      await this.sessionsQueue.add(
        'process-session',
        { sessionId, audioUrls: {}, participantIds },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, jobId: `process-session-${sessionId}` },
      );
      await this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: { status: 'PROCESSING', updatedAt: new Date() },
      });
      (session as any).status = 'PROCESSING';
    }

    // Recovery: if stuck in PROCESSING for >45s with no real Analysis records, re-queue
    if (
      session.status === 'PROCESSING' &&
      (!session.analyses || session.analyses.length === 0) &&
      session.updatedAt &&
      Date.now() - new Date(session.updatedAt).getTime() > 45_000
    ) {
      const feedbacks = await this.prisma.feedback.findMany({
        where: { sessionId },
        select: { transcript: true },
      });
      const hasContent = feedbacks.some(
        (fb) =>
          Array.isArray(fb.transcript) && (fb.transcript as any[]).length > 0,
      );
      if (hasContent) {
        this.logger.warn(
          `[SessionsService] Session ${sessionId} stuck in PROCESSING with no analyses. Re-queuing.`,
        );
        const participantIds = session.participants.map((p) => p.userId);
        await this.sessionsQueue.add(
          'process-session',
          { sessionId, audioUrls: {}, participantIds },
          { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, jobId: `process-session-${sessionId}` },
        );
        await this.prisma.conversationSession.update({
          where: { id: sessionId },
          data: { updatedAt: new Date() },
        });
      }
    }

    // Find the participant record for the requesting user
    const myParticipant = session.participants.find((p) => p.userId === userId);

    // Filter analyses to show the current user's analysis first
    if (myParticipant && session.analyses?.length > 0) {
      const myAnalysis = session.analyses.find(
        (a) => a.participantId === myParticipant.id,
      );
      if (myAnalysis) {
        // Put the user's own analysis first
        const otherAnalyses = session.analyses.filter(
          (a) => a.participantId !== myParticipant.id,
        );
        session.analyses = [myAnalysis, ...otherAnalyses];
      }
    }

    // Provide a merged transcript string for mobile (CallFeedbackScreen expects session.feedback.transcript
    // or session.summaryJson.transcript). Feedback rows store per-participant segments; merge and sort by timestamp.
    try {
      type Seg = { speaker_id?: string; text?: string; timestamp?: number | string };
      const merged: { speaker_id: string; text: string; timestamp: number }[] = [];
      for (const fb of (session as any).feedbacks ?? []) {
        const arr = Array.isArray(fb.transcript) ? (fb.transcript as Seg[]) : [];
        for (const s of arr) {
          const ts =
            typeof s.timestamp === 'number'
              ? s.timestamp
              : typeof s.timestamp === 'string'
                ? Number(s.timestamp) || 0
                : 0;
          merged.push({
            speaker_id: String(s.speaker_id ?? fb.participantId ?? 'unknown'),
            text: String(s.text ?? ''),
            timestamp: ts,
          });
        }
      }
      merged.sort((a, b) => a.timestamp - b.timestamp);
      const transcriptText = merged
        .filter((s) => s.text.trim().length > 0)
        .map((s) => `${s.speaker_id}: ${s.text.trim()}`)
        .join('\n');
      (session as any).feedback = { transcript: transcriptText };
    } catch (e) {
      // Non-fatal: keep response shape stable even if transcript merge fails
      (session as any).feedback = { transcript: '' };
    }

    return session;
  }

  async getUserSessions(userId: string) {
    return this.prisma.conversationSession.findMany({
      where: {
        participants: {
          some: {
            userId: userId,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                clerkId: true,
                fname: true,
                lname: true,
              },
            },
          },
        },
        analyses: {
          where: {
            participant: {
              userId: userId,
            },
          },
          select: {
            scores: true,
            cefrLevel: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async startSession(data: {
    matchId: string;
    participants: string[];
    topic: string;
    estimatedDuration: number;
  }) {
    try {
      const session = await this.prisma.conversationSession.create({
        data: {
          topic: data.topic,
          status: 'CREATED',
          participants: {
            create: data.participants.map((userId) => ({
              userId,
            })),
          },
        },
        include: {
          participants: true,
        },
      });
      return session;
    } catch (error) {
      this.logger.error(`Failed to start session: ${error.message}`);
      throw error;
    }
  }

  async startStructuredSession(
    userAId: string,
    userBId: string,
    structureName: string,
  ) {
    // Dynamic import to avoid circular dependency issues if any, or just standard import
    const { SESSION_STRUCTURES } = await import('./session-structures.data');
    const structure =
      SESSION_STRUCTURES[structureName as keyof typeof SESSION_STRUCTURES];

    if (!structure) {
      throw new BadRequestException('Invalid session structure');
    }

    const session = await this.prisma.conversationSession.create({
      data: {
        topic: structure.topic,
        status: 'CREATED',
        structure: structureName,
        objectives: structure.objectives,
        checkpoints: structure.checkpoints as any, // Prisma Json type workaround
        participants: {
          create: [{ userId: userAId }, { userId: userBId }],
        },
      } as any,
      include: {
        participants: true,
      },
    });

    // TODO: Schedule checkpoint notifications via a queue or scheduler
    // For now, we store them and the client or a background job can handle them

    return session;
  }

  async heartbeat(sessionId: string, userId: string) {
    try {
      // Also update session status to IN_PROGRESS if it was CREATED
      const session = await this.prisma.conversationSession.findUnique({
        where: { id: sessionId },
      });

      if (session && session.status === 'CREATED') {
        await this.prisma.conversationSession.update({
          where: { id: sessionId },
          data: { status: 'IN_PROGRESS' },
        });
      }

      await this.prisma.sessionParticipant.update({
        where: {
          sessionId_userId: { sessionId, userId },
        },
        data: {
          lastHeartbeat: new Date(),
        },
      });
      return { status: 'ok' };
    } catch (error) {
      this.logger.error(
        `Heartbeat failed for session ${sessionId}, user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /** Normalize to segments array (each device sends only its own speech). */
  private normalizeSegments(
    transcript?: { speaker_id: string; text: string; timestamp?: string }[],
  ): { speaker_id: string; text: string; timestamp?: string }[] {
    if (!Array.isArray(transcript) || transcript.length === 0) return [];
    return transcript.filter(
      (s) => s && typeof s.text === 'string' && s.text.trim().length > 0,
    ).map((s) => ({
      speaker_id: s.speaker_id,
      text: s.text.trim(),
      timestamp: s.timestamp,
    }));
  }

  async endSession(
    sessionId: string,
    userId: string,
    data?: {
      actualDuration?: number;
      userEndedEarly?: boolean;
      audioUrls?: Record<string, string>;
      transcript?: { speaker_id: string; text: string; timestamp?: string }[];
    },
  ) {
    try {
      const segments = this.normalizeSegments(data?.transcript);

      const session = await this.prisma.conversationSession.findUnique({
        where: { id: sessionId },
        include: { participants: true, feedbacks: true },
      });

      if (!session) throw new Error('Session not found');

      const myParticipant = session.participants.find((p) => p.userId === userId);
      if (!myParticipant) {
        throw new Error('You are not a participant of this session');
      }

      // Idempotency: already completed/failed
      if (['COMPLETED', 'ANALYSIS_FAILED'].includes(session.status)) {
        this.logger.warn(`Session ${sessionId} is already ${session.status}.`);
        return { status: session.status, sessionId };
      }

      const endedAt = new Date();
      const duration =
        data?.actualDuration ??
        Math.floor((endedAt.getTime() - session.createdAt.getTime()) / 1000);

      // Upsert this participant's transcript only (per-device authority)
      await this.prisma.feedback.upsert({
        where: {
          sessionId_participantId: {
            sessionId,
            participantId: myParticipant.id,
          },
        },
        create: {
          sessionId,
          participantId: myParticipant.id,
          transcript: segments as any,
        },
        update: { transcript: segments as any },
      });

      await this.prisma.conversationSession.update({
        where: { id: sessionId },
        data: {
          status: 'PROCESSING',
          endedAt,
          duration,
        },
      });

      const sessionData = session as any;
      if (sessionData.structure && session.participants.length === 2) {
        const { SESSION_STRUCTURES } =
          await import('./session-structures.data');
        const structure =
          SESSION_STRUCTURES[
            sessionData.structure as keyof typeof SESSION_STRUCTURES
          ];
        const expectedDuration = structure ? structure.duration * 60 : 600;
        for (const participant of session.participants) {
          await this.reliabilityService.recordSessionComplete(
            participant.userId,
            duration,
            expectedDuration,
          );
        }
      }

      const participantIds = session.participants.map((p) => p.userId);
      this.logger.log(
        `[endSession] Session ${sessionId} → PROCESSING. Participant ${userId} submitted ${segments.length} segments. Queuing job.`,
      );

      const job = await this.sessionsQueue.add(
        'process-session',
        {
          sessionId,
          audioUrls: data?.audioUrls || {},
          participantIds,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          jobId: `process-session-${sessionId}`,
        },
      );

      this.logger.log(
        `[endSession] Job ${job.id} queued for session ${sessionId}`,
      );

      return { status: 'PROCESSING', sessionId };
    } catch (error) {
      this.logger.error(`Failed to end session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  async updateParticipantAudio(
    sessionId: string,
    userId: string,
    audioUrl: string,
  ) {
    try {
      await this.prisma.sessionParticipant.update({
        where: {
          sessionId_userId: { sessionId, userId },
        },
        data: {
          audioUrl,
        },
      });
      return { status: 'ok' };
    } catch (error) {
      this.logger.error(
        `Failed to update audio for session ${sessionId}, user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  async uploadAudio(userId: string, sessionId: string, audioBase64: string) {
    try {
      const buffer = Buffer.from(audioBase64, 'base64');
      const key = `sessions/${sessionId}/${userId}_${Date.now()}.wav`;
      const audioUrl = await this.azureStorage.uploadFile(
        buffer,
        key,
        'audio/wav',
      );
      return { audioUrl };
    } catch (error) {
      this.logger.error(
        `Audio upload failed for session ${sessionId}: ${error.message}`,
      );
      throw error;
    }
  }
}
