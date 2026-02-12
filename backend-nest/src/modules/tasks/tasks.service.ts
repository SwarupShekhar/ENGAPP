import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class TasksService {
    private readonly logger = new Logger(TasksService.name);

    constructor(private prisma: PrismaService) { }

    async createTasksFromMistakes(mistakesByCategory: any, userId: string, sessionId: string) {
        try {
            this.logger.log(`Generating tasks for user ${userId} from session ${sessionId}`);

            // Logic to pick focus areas and generate tasks
            // For MVP, we'll create a generic task if there are grammar mistakes
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
                        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due tomorrow
                    },
                });

                // Link mistakes to task (Junction table)
                // Find the mistakes we just created for this user/session
                // Note: In a real app, the Analysis record would be passed here
                // For simplicity, we'll assume we want to link the first few grammar mistakes
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
        } catch (error) {
            this.logger.error(`Failed to generate tasks: ${error.message}`);
            throw error;
        }
    }

    async getDailyTasks(userId: string) {
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

    async completeTask(taskId: string, score: number) {
        return this.prisma.learningTask.update({
            where: { id: taskId },
            data: {
                status: 'completed',
                completedAt: new Date(),
                score,
            },
        });
    }
}
