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
var TasksService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma/prisma.service");
let TasksService = TasksService_1 = class TasksService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TasksService_1.name);
    }
    async createTasksFromMistakes(mistakesByCategory, userId, sessionId) {
        try {
            this.logger.log(`Generating tasks for user ${userId} from session ${sessionId}`);
            if (mistakesByCategory.grammar && mistakesByCategory.grammar.length > 0) {
                const task = await this.prisma.learningTask.create({
                    data: {
                        userId,
                        sessionId,
                        type: 'grammar_drill',
                        title: 'Grammar Focus: Past Tense',
                        content: {
                            focus: 'irregular_verbs',
                            instructions: 'Practice the corrected sentences from your last session.',
                        },
                        status: 'pending',
                        estimatedMinutes: 8,
                        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    },
                });
                const analysis = await this.prisma.analysis.findFirst({
                    where: { sessionId, participant: { userId } },
                    include: { mistakes: true },
                });
                if (analysis && analysis.mistakes) {
                    const grammarMistakes = analysis.mistakes.filter(m => m.type === 'grammar');
                    for (const m of grammarMistakes) {
                        await this.prisma.taskMistake.create({
                            data: {
                                task: { connect: { id: task.id } },
                                mistake: { connect: { id: m.id } },
                            },
                        });
                    }
                }
            }
            return { status: 'tasks_generated' };
        }
        catch (error) {
            this.logger.error(`Failed to generate tasks: ${error.message}`);
            throw error;
        }
    }
    async getDailyTasks(userId) {
        return this.prisma.learningTask.findMany({
            where: {
                userId,
                status: 'pending',
            },
            orderBy: {
                dueDate: 'asc',
            },
            include: {
                mistakes: {
                    include: {
                        mistake: true,
                    },
                },
            },
        });
    }
    async completeTask(taskId, score) {
        return this.prisma.learningTask.update({
            where: { id: taskId },
            data: {
                status: 'completed',
                completedAt: new Date(),
                score,
            },
        });
    }
};
exports.TasksService = TasksService;
exports.TasksService = TasksService = TasksService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TasksService);
//# sourceMappingURL=tasks.service.js.map