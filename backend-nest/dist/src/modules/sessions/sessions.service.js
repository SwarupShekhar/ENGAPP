"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SessionsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionsService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const prisma_service_1 = require("../../database/prisma/prisma.service");
let SessionsService = SessionsService_1 = class SessionsService {
    constructor(prisma, sessionsQueue) {
        this.prisma = prisma;
        this.sessionsQueue = sessionsQueue;
        this.logger = new common_1.Logger(SessionsService_1.name);
    }
    async startSession(data) {
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
        }
        catch (error) {
            this.logger.error(`Failed to start session: ${error.message}`);
            throw error;
        }
    }
    async heartbeat(sessionId, userId) {
        try {
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
        }
        catch (error) {
            this.logger.error(`Heartbeat failed for session ${sessionId}, user ${userId}: ${error.message}`);
            throw error;
        }
    }
    async endSession(sessionId, data) {
        try {
            const session = await this.prisma.conversationSession.findUnique({
                where: { id: sessionId },
                include: { participants: true },
            });
            if (!session)
                throw new Error('Session not found');
            if (['PROCESSING', 'COMPLETED', 'ANALYSIS_FAILED'].includes(session.status)) {
                this.logger.warn(`Session ${sessionId} is already ${session.status}.`);
                return { status: session.status, sessionId };
            }
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
        }
        catch (error) {
            this.logger.error(`Failed to end session ${sessionId}: ${error.message}`);
            throw error;
        }
    }
};
exports.SessionsService = SessionsService;
exports.SessionsService = SessionsService = SessionsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bull_1.InjectQueue)('sessions')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object])
], SessionsService);
//# sourceMappingURL=sessions.service.js.map