import { Injectable, Logger } from '@nestjs/common';
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

    async endSession(sessionId: string, data: { actualDuration: number; userEndedEarly: boolean; audioUrls: Record<string, string> }) {
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

            // 2) Update session and participants with final data
            await this.prisma.conversationSession.update({
                where: { id: sessionId },
                data: {
                    status: 'PROCESSING',
                    endedAt: new Date(),
                    duration: data.actualDuration,
                },
            });

            const participantIds = [];
            for (const participant of session.participants) {
                const audioUrl = data.audioUrls[participant.userId];
                const updatedParticipant = await this.prisma.sessionParticipant.update({
                    where: { id: participant.id },
                    data: { audioUrl },
                });
                participantIds.push(updatedParticipant.id);
            }

            // 3) Push to Bull Queue with Retries
            await this.sessionsQueue.add('process-session', {
                sessionId,
                audioUrls: data.audioUrls,
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
