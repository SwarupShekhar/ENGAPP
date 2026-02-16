import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AssessmentService } from '../assessment/assessment.service';
import { TasksService } from '../tasks/tasks.service';

@Processor('sessions')
export class SessionsProcessor {
    private readonly logger = new Logger(SessionsProcessor.name);

    constructor(
        private prisma: PrismaService,
        private assessmentService: AssessmentService,
        private tasksService: TasksService,
    ) { }

    @Process('process-session')
    async handleProcessSession(job: Job<any>) {
        const { sessionId, audioUrls, participantIds } = job.data;
        this.logger.log(`Processing session ${sessionId} in background (started)...`);

        try {
            // 1) Update session status to PROCESSING
            await this.prisma.conversationSession.update({
                where: { id: sessionId },
                data: { status: 'PROCESSING' },
            });

            // Short-circuit if transcript is empty (silent call)
            const transcript = job.data.transcript || '';
            if (!transcript.trim()) {
                this.logger.log(`Short-circuiting session ${sessionId}: No speech detected.`);

                // Create dummy zero analyses for participants so the UI shows something
                await Promise.all(participantIds.map(async (participantId) => {
                    await this.prisma.analysis.upsert({
                        where: { sessionId_participantId: { sessionId, participantId } },
                        create: {
                            sessionId,
                            participantId,
                            rawData: { message: "No speech detected" },
                            scores: { grammar: 0, pronunciation: 0, fluency: 0, vocabulary: 0, overall: 0 },
                            cefrLevel: 'N/A'
                        },
                        update: {}
                    });
                }));

                await this.prisma.conversationSession.update({
                    where: { id: sessionId },
                    data: { status: 'COMPLETED' },
                });
                return;
            }

            // 2) AI Pipeline - Process all participants in parallel
            await Promise.all(participantIds.map(async (participantId) => {
                const participant = await this.prisma.sessionParticipant.findUnique({
                    where: { id: participantId },
                });

                if (!participant || !participant.audioUrl) {
                    this.logger.warn(`No audio URL for participant ${participantId}, skipping.`);
                    return;
                }

                this.logger.log(`Starting AI pipeline for participant ${participantId}`);

                // A) Analyze and Store using AssessmentService (Orchestrator)
                const result = await this.assessmentService.analyzeAndStore(
                    sessionId,
                    participantId,
                    participant.audioUrl,
                    job.data.transcript
                );

                // B) Generate Tasks based on mistakes
                if (result.feedback.mistakes && result.feedback.mistakes.length > 0) {
                    // Map mistakes to format expected by TasksService if necessary
                    // Assuming tasksService handles raw mistakes list or we adapt it here
                    // For now, simpler integration:
                    await this.tasksService.createTasksFromMistakes(result.feedback.mistakes, participant.userId, sessionId);
                }
            }));

            // 3) Mark session as COMPLETED
            await this.prisma.conversationSession.update({
                where: { id: sessionId },
                data: { status: 'COMPLETED' },
            });

            this.logger.log(`Session ${sessionId} processing completed successfully.`);
        } catch (error) {
            this.logger.error(`Failed to process session ${sessionId}: ${error.message}`);
            require('fs').appendFileSync('debug_session.log', `[SessionsProcessor] Error processing session ${sessionId}: ${error.message}\nStack: ${error.stack}\n`);

            // Mark as ANALYSIS_FAILED to allow manual retry or debugging
            await this.prisma.conversationSession.update({
                where: { id: sessionId },
                data: { status: 'ANALYSIS_FAILED' },
            }).catch(() => { });

            throw error; // Let Bull handle the retry
        }
    }
}
