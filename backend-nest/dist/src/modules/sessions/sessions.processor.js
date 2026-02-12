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
var SessionsProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionsProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma/prisma.service");
const assessment_service_1 = require("../assessment/assessment.service");
const tasks_service_1 = require("../tasks/tasks.service");
let SessionsProcessor = SessionsProcessor_1 = class SessionsProcessor {
    constructor(prisma, assessmentService, tasksService) {
        this.prisma = prisma;
        this.assessmentService = assessmentService;
        this.tasksService = tasksService;
        this.logger = new common_1.Logger(SessionsProcessor_1.name);
    }
    async handleProcessSession(job) {
        const { sessionId, audioUrls, participantIds } = job.data;
        this.logger.log(`Processing session ${sessionId} in background (started)...`);
        try {
            await this.prisma.conversationSession.update({
                where: { id: sessionId },
                data: { status: 'PROCESSING' },
            });
            await Promise.all(participantIds.map(async (participantId) => {
                const participant = await this.prisma.sessionParticipant.findUnique({
                    where: { id: participantId },
                });
                if (!participant || !participant.audioUrl) {
                    this.logger.warn(`No audio URL for participant ${participantId}, skipping.`);
                    return;
                }
                this.logger.log(`Starting AI pipeline for participant ${participantId}`);
                const result = await this.assessmentService.analyzeAndStore(sessionId, participantId, participant.audioUrl);
                if (result.feedback.mistakes && result.feedback.mistakes.length > 0) {
                    await this.tasksService.createTasksFromMistakes(result.feedback.mistakes, participant.userId, sessionId);
                }
            }));
            await this.prisma.conversationSession.update({
                where: { id: sessionId },
                data: { status: 'COMPLETED' },
            });
            this.logger.log(`Session ${sessionId} processing completed successfully.`);
        }
        catch (error) {
            this.logger.error(`Failed to process session ${sessionId}: ${error.message}`);
            require('fs').appendFileSync('debug_session.log', `[SessionsProcessor] Error processing session ${sessionId}: ${error.message}\nStack: ${error.stack}\n`);
            await this.prisma.conversationSession.update({
                where: { id: sessionId },
                data: { status: 'ANALYSIS_FAILED' },
            }).catch(() => { });
            throw error;
        }
    }
};
exports.SessionsProcessor = SessionsProcessor;
__decorate([
    (0, bull_1.Process)('process-session'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SessionsProcessor.prototype, "handleProcessSession", null);
exports.SessionsProcessor = SessionsProcessor = SessionsProcessor_1 = __decorate([
    (0, bull_1.Processor)('sessions'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        assessment_service_1.AssessmentService,
        tasks_service_1.TasksService])
], SessionsProcessor);
//# sourceMappingURL=sessions.processor.js.map