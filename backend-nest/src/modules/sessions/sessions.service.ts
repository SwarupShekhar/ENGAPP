import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AzureStorageService } from '../../integrations/azure-storage.service';

@Injectable()
export class SessionsService {
    private readonly logger = new Logger(SessionsService.name);

    constructor(
        private prisma: PrismaService,
        private azureStorage: AzureStorageService,
        @InjectQueue('sessions') private sessionsQueue: Queue,
    ) { }

    async getSessionAnalysis(sessionId: string, userId: string) {
        this.logger.log(`[SessionsService] Requesting analysis for session: ${sessionId}, user: ${userId}`);
        const sessionCount = await this.prisma.conversationSession.count();
        this.logger.log(`[SessionsService] DB check: Total sessions = ${sessionCount}`);

        const session = await this.prisma.conversationSession.findUnique({
            where: { id: sessionId },
            include: {
                analyses: {
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

    async getUserSessions(userId: string) {
        return this.prisma.conversationSession.findMany({
            where: {
                participants: {
                    some: {
                        userId: userId
                    }
                }
            },
            include: {
                participants: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                fname: true,
                                lname: true
                            }
                        }
                    }
                },
                analyses: {
                    where: {
                        participant: {
                            userId: userId
                        }
                    },
                    select: {
                        scores: true,
                        cefrLevel: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
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

    async endSession(sessionId: string, data?: { actualDuration?: number; userEndedEarly?: boolean; audioUrls?: Record<string, string>; transcript?: string }) {
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
                    feedback: data?.transcript ? {
                        upsert: {
                            create: { transcript: data.transcript },
                            update: { transcript: data.transcript }
                        }
                    } : undefined,
                },
            });

            // 3) Trigger Analysis via Queue
            // We use participant IDs from the fetched session
            const participantIds = session.participants.map(p => p.userId);

            await this.sessionsQueue.add('process-session', {
                sessionId,
                audioUrls: data?.audioUrls || {},
                participantIds,
                transcript: data?.transcript || '',
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

    async updateParticipantAudio(sessionId: string, userId: string, audioUrl: string) {
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
            this.logger.error(`Failed to update audio for session ${sessionId}, user ${userId}: ${error.message}`);
            throw error;
        }
    }

    async uploadAudio(userId: string, sessionId: string, audioBase64: string) {
        try {
            const buffer = Buffer.from(audioBase64, 'base64');
            const key = `sessions/${sessionId}/${userId}_${Date.now()}.wav`;
            const audioUrl = await this.azureStorage.uploadFile(buffer, key, 'audio/wav');
            return { audioUrl };
        } catch (error) {
            this.logger.error(`Audio upload failed for session ${sessionId}: ${error.message}`);
            throw error;
        }
    }
}
