import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class SessionsService {
    private readonly logger = new Logger(SessionsService.name);

    constructor(
        private prisma: PrismaService,
        @InjectQueue('sessions') private sessionsQueue: Queue,
    ) { }

    async getSessionAnalysis(sessionId: string, userId: string) {
        this.logger.log(`DEBUG: Fetching analysis for session ${sessionId}, user ${userId}`);
        const sessionCount = await this.prisma.conversationSession.count();
        this.logger.log(`DEBUG: Total sessions in DB: ${sessionCount}`);

        const session = await this.prisma.conversationSession.findUnique({
            where: { id: sessionId },
            include: {
                analyses: {
                    where: {
                        participant: {
                            userId: userId
                        }
                    },
                    include: {
                        mistakes: true,
                        pronunciationIssues: true
                    }
                },
                participants: {
                    include: {
                        user: true
                    }
                }
            }
        });

        if (!session) {
            const latestSession = await this.prisma.conversationSession.findFirst({
                orderBy: { createdAt: 'desc' }
            });
            throw new BadRequestException({
                message: 'Session not found in database',
                debug: {
                    requestedSessionId: sessionId,
                    requestedUserId: userId,
                    totalSessionsInDb: sessionCount,
                    latestSessionId: latestSession?.id || 'none'
                }
            });
        }

        return session;

        return session;
    }

    async startSession(data: { matchId: string; participants: string[]; topic: string; estimatedDuration: number }) {
        try {
            const session = await this.prisma.conversationSession.create({
                data: {
                    topic: data.topic,
                    status: 'CREATED',
                    participants: {
                        create: data.participants.map(userId => ({
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
            this.logger.error(`Heartbeat failed for session ${sessionId}, user ${userId}: ${error.message}`);
            throw error;
        }
    }

    async endSession(sessionId: string, data?: { actualDuration?: number; userEndedEarly?: boolean; audioUrls?: Record<string, string> }) {
        try {
            // 1) Check status – idempotency
            const session = await this.prisma.conversationSession.findUnique({
                where: { id: sessionId },
                include: { participants: true },
            });

            if (!session) throw new Error('Session not found');
            if (['PROCESSING', 'COMPLETED', 'ANALYSIS_FAILED'].includes(session.status)) {
                this.logger.warn(`Session ${sessionId} is already ${session.status}.`);
                return { status: session.status, sessionId };
            }

            // 2) Update session with final data
            const endedAt = new Date();
            // Fallback to server-calculated duration if not provided
            const duration = data?.actualDuration ?? Math.floor((endedAt.getTime() - session.createdAt.getTime()) / 1000);

            await this.prisma.conversationSession.update({
                where: { id: sessionId },
                data: {
                    status: 'PROCESSING',
                    endedAt: endedAt,
                    duration: duration,
                },
            });

            // 3) Trigger Analysis via Queue
            // We use participant IDs from the fetched session
            const participantIds = session.participants.map(p => p.userId);

            await this.sessionsQueue.add('process-session', {
                sessionId,
                audioUrls: data?.audioUrls || {},
                participantIds,
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
            });

            return { status: 'PROCESSING', sessionId };
        } catch (error) {
            this.logger.error(`Failed to end session ${sessionId}: ${error.message}`);
            throw error;
        }
    }
}
