import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class FeedbackService {
    private readonly logger = new Logger(FeedbackService.name);

    constructor(private prisma: PrismaService) { }

    async getFeedback(sessionId: string, userId: string) {
        try {
            // 1) Fetch session data
            const session = await this.prisma.conversationSession.findUnique({
                where: { id: sessionId },
                include: {
                    participants: {
                        include: { user: true },
                    },
                    feedback: true,
                },
            });

            if (!session) throw new NotFoundException('Session not found');

            // 2) Find current user's participant record and analysis
            const myParticipant = session.participants.find(p => p.userId === userId);
            const partnerParticipant = session.participants.find(p => p.userId !== userId);

            if (!myParticipant) throw new NotFoundException('User participant record not found');

            const analysis = await this.prisma.analysis.findUnique({
                where: { participantId: myParticipant.id },
                include: {
                    mistakes: true,
                    pronunciationIssues: true,
                },
            });

            // Return status-only if not completed/failed
            if (!analysis) {
                return {
                    status: session.status,
                    sessionId,
                    message: session.status === 'PROCESSING' ? 'AI analysis is in progress' : 'Analysis not found'
                };
            }

            // 3) Fetch generated tasks for this session/user
            const tasks = await this.prisma.learningTask.findMany({
                where: { sessionId, userId },
            });

            // 4) Structure final response according to Production JSON contract
            return {
                status: session.status, // CREATED, IN_PROGRESS, ENDED, PROCESSING, COMPLETED, ANALYSIS_FAILED
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
                    avgResponseTime: 0, // Placeholder for future enhancement
                    scores: analysis.scores, // { grammar, pronunciation, fluency, vocabulary, overall }
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
        } catch (error) {
            this.logger.error(`Failed to get feedback for session ${sessionId}: ${error.message}`);
            throw error;
        }
    }

    private parseInterleavedTranscript(rawData: any, mistakes: any[]) {
        const segments = rawData?.transcript?.segments || [];
        return segments.map((seg: any) => ({
            speaker: seg.speaker === 'me' ? 'you' : 'partner',
            text: seg.text,
            startTime: seg.start_time,
            errors: mistakes.filter(m => m.segmentId === seg.id).map(m => m.id),
        }));
    }
}
