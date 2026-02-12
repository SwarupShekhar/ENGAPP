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
var FeedbackService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma/prisma.service");
let FeedbackService = FeedbackService_1 = class FeedbackService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(FeedbackService_1.name);
    }
    async getFeedback(sessionId, userId) {
        try {
            const session = await this.prisma.conversationSession.findUnique({
                where: { id: sessionId },
                include: {
                    participants: {
                        include: { user: true },
                    },
                    feedback: true,
                },
            });
            if (!session)
                throw new common_1.NotFoundException('Session not found');
            const myParticipant = session.participants.find(p => p.userId === userId);
            const partnerParticipant = session.participants.find(p => p.userId !== userId);
            if (!myParticipant)
                throw new common_1.NotFoundException('User participant record not found');
            const analysis = await this.prisma.analysis.findUnique({
                where: { participantId: myParticipant.id },
                include: {
                    mistakes: true,
                    pronunciationIssues: true,
                },
            });
            if (!analysis) {
                return {
                    status: session.status,
                    sessionId,
                    message: session.status === 'PROCESSING' ? 'AI analysis is in progress' : 'Analysis not found'
                };
            }
            const tasks = await this.prisma.learningTask.findMany({
                where: { sessionId, userId },
            });
            return {
                status: session.status,
                session: {
                    id: session.id,
                    date: session.startedAt,
                    duration: session.duration,
                    partner: partnerParticipant ? {
                        id: partnerParticipant.user.id,
                        name: `${partnerParticipant.user.fname} ${partnerParticipant.user.lname}`,
                        level: partnerParticipant.user.level,
                    } : null,
                    topic: session.topic,
                },
                yourStats: {
                    speakingTime: myParticipant.speakingTime,
                    turnsTaken: myParticipant.turnsTaken,
                    avgResponseTime: 0,
                    scores: analysis.scores,
                },
                transcript: {
                    raw: analysis.rawData['transcript'] || '',
                    interleaved: this.parseInterleavedTranscript(analysis.rawData, analysis.mistakes),
                },
                mistakes: {
                    byCategory: {
                        grammar: analysis.mistakes.filter(m => m.type === 'grammar').length,
                        pronunciation: analysis.pronunciationIssues.length,
                        vocabulary: analysis.mistakes.filter(m => m.type === 'vocabulary').length,
                    },
                    items: analysis.mistakes.map(m => ({
                        id: m.id,
                        type: m.type,
                        severity: m.severity,
                        original: m.original,
                        corrected: m.corrected,
                        explanation: m.explanation,
                        timestamp: m.timestamp,
                        segmentId: m.segmentId,
                    })),
                    pronunciationItems: analysis.pronunciationIssues.map(p => ({
                        id: p.id,
                        word: p.word,
                        issue: p.issueType,
                        suggestion: p.suggestion,
                        timestamp: p.audioStart,
                        confidence: p.confidence,
                    })),
                },
                generatedTasks: tasks.map(t => ({
                    id: t.id,
                    type: t.type,
                    title: t.title,
                    estimatedMinutes: t.estimatedMinutes,
                    dueDate: t.dueDate,
                })),
            };
        }
        catch (error) {
            this.logger.error(`Failed to get feedback for session ${sessionId}: ${error.message}`);
            throw error;
        }
    }
    parseInterleavedTranscript(rawData, mistakes) {
        const segments = rawData?.transcript?.segments || [];
        return segments.map((seg) => ({
            speaker: seg.speaker === 'me' ? 'you' : 'partner',
            text: seg.text,
            startTime: seg.start_time,
            errors: mistakes.filter(m => m.segmentId === seg.id).map(m => m.id),
        }));
    }
};
exports.FeedbackService = FeedbackService;
exports.FeedbackService = FeedbackService = FeedbackService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FeedbackService);
//# sourceMappingURL=feedback.service.js.map