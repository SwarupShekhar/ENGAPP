import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class TasksService {
    private readonly logger = new Logger(TasksService.name);

    constructor(private prisma: PrismaService) { }

    private severityToScore(severity?: string | null): number {
        const s = (severity || '').toLowerCase();
        if (s === 'high') return 90;
        if (s === 'medium') return 60;
        if (s === 'low') return 30;
        return 50;
    }

    private normalizeMistakeCategory(type?: string | null): 'grammar' | 'vocabulary' | 'other' {
        const t = (type || '').toLowerCase();
        if (t.includes('vocab')) return 'vocabulary';
        if (t.includes('grammar')) return 'grammar';
        return 'other';
    }

    /**
     * Explicit task generation for a session.
     *
     * Grouping / prioritization is intentionally centralized here so it can be tuned later:
     * - Pronunciation issues first (most actionable for practice)
     * - Grammar mistakes second
     * - Vocabulary mistakes third
     *
     * Within each bucket, we prioritize by:
     * - Higher severity (mapped to a numeric score)
     * - Higher repetition count (same "key" repeated in the session)
     * - (For pronunciation) lower confidence implies higher severity
     */
    async generateTasksForSession(sessionId: string, userId: string) {
        // Auth guard: only a session participant can generate tasks for this session
        const participant = await this.prisma.sessionParticipant.findUnique({
            where: { sessionId_userId: { sessionId, userId } },
            select: { id: true },
        });
        if (!participant) {
            throw new BadRequestException({ message: 'You do not have access to this session' });
        }

        // Idempotency: if tasks already exist for this user+session, return them
        const existingTasks = await this.prisma.learningTask.findMany({
            where: {
                sessionId,
                userId,
                type: { in: ['pronunciation', 'grammar', 'vocabulary'] },
            },
            orderBy: { createdAt: 'asc' },
            include: {
                mistakes: { include: { mistake: true } },
                pronunciationIssues: { include: { pronunciationIssue: true } },
            },
        });
        if (existingTasks.length > 0) {
            const sorted = [...existingTasks].sort((a, b) => {
                const as = Number((a.content as any)?.severityScore ?? 0);
                const bs = Number((b.content as any)?.severityScore ?? 0);
                return bs - as;
            });
            return sorted;
        }

        const analysis = await this.prisma.analysis.findFirst({
            where: { sessionId, participant: { userId } },
            include: { mistakes: true, pronunciationIssues: true },
        });

        if (!analysis) {
            throw new NotFoundException({ message: `No Analysis found for sessionId=${sessionId}. Generate analysis first, then generate tasks.` });
        }

        type Candidate =
            | {
                kind: 'pronunciation';
                key: string;
                issueIds: string[];
                word: string;
                userSaid: string;
                correct: string;
                phoneticActual?: string | null;
                phoneticExpected?: string | null;
                severity: string;
                severityScore: number;
                repetition: number;
            }
            | {
                kind: 'grammar' | 'vocabulary';
                key: string;
                mistakeIds: string[];
                phrase: string;
                userSaid: string;
                correct: string;
                severity: string;
                severityScore: number;
                repetition: number;
            };

        // 1) Pronunciation candidates (grouped by word)
        const pronByWord = new Map<string, typeof analysis.pronunciationIssues>();
        for (const pi of analysis.pronunciationIssues) {
            const w = (pi.word || '').trim();
            if (!w) continue;
            const arr = pronByWord.get(w) ?? [];
            arr.push(pi);
            pronByWord.set(w, arr);
        }
        const pronunciationCandidates: Candidate[] = [];
        for (const [word, issues] of pronByWord.entries()) {
            // Use the "worst" issue to represent the group
            const worst = [...issues].sort((a, b) => {
                const as = this.severityToScore(a.severity) + (a.confidence != null ? (100 - a.confidence) * 0.2 : 0);
                const bs = this.severityToScore(b.severity) + (b.confidence != null ? (100 - b.confidence) * 0.2 : 0);
                return bs - as;
            })[0];
            const severityScore =
                this.severityToScore(worst.severity) +
                (worst.confidence != null ? (100 - worst.confidence) * 0.2 : 0) +
                Math.min(issues.length, 5) * 4;
            pronunciationCandidates.push({
                kind: 'pronunciation',
                key: `pron:${word.toLowerCase()}`,
                issueIds: issues.map((x) => x.id),
                word,
                userSaid: worst.word,
                correct: worst.suggestion || '',
                phoneticActual: worst.phoneticActual ?? null,
                phoneticExpected: worst.phoneticExpected ?? null,
                severity: worst.severity,
                severityScore,
                repetition: issues.length,
            });
        }

        // 2) Grammar/Vocabulary candidates (grouped by original→corrected)
        const byKey = new Map<string, { kind: 'grammar' | 'vocabulary'; mistakes: typeof analysis.mistakes }>();
        for (const m of analysis.mistakes) {
            const cat = this.normalizeMistakeCategory(m.type);
            const kind = cat === 'vocabulary' ? 'vocabulary' : cat === 'grammar' ? 'grammar' : null;
            if (!kind) continue;
            const original = (m.original || '').trim();
            const corrected = (m.corrected || '').trim();
            if (!original || !corrected) continue;
            const key = `${kind}:${original.toLowerCase()}→${corrected.toLowerCase()}`;
            const existing = byKey.get(key);
            if (existing) existing.mistakes.push(m);
            else byKey.set(key, { kind, mistakes: [m] });
        }

        const mistakeCandidates: Candidate[] = [];
        for (const [key, group] of byKey.entries()) {
            const worst = [...group.mistakes].sort((a, b) => {
                const as = this.severityToScore(a.severity) + (a.masteryScore != null ? (100 - a.masteryScore) * 0.1 : 0);
                const bs = this.severityToScore(b.severity) + (b.masteryScore != null ? (100 - b.masteryScore) * 0.1 : 0);
                return bs - as;
            })[0];
            const severityScore =
                this.severityToScore(worst.severity) +
                Math.min(group.mistakes.length, 5) * 4 +
                (worst.masteryScore != null ? (100 - worst.masteryScore) * 0.1 : 0);
            mistakeCandidates.push({
                kind: group.kind,
                key,
                mistakeIds: group.mistakes.map((x) => x.id),
                phrase: worst.corrected,
                userSaid: worst.original,
                correct: worst.corrected,
                severity: worst.severity,
                severityScore,
                repetition: group.mistakes.length,
            });
        }

        // Merge in required priority order (pronunciation → grammar → vocabulary), then severityScore desc
        const ordered: Candidate[] = [
            ...pronunciationCandidates.sort((a, b) => b.severityScore - a.severityScore),
            ...mistakeCandidates.filter((c) => c.kind === 'grammar').sort((a, b) => b.severityScore - a.severityScore),
            ...mistakeCandidates.filter((c) => c.kind === 'vocabulary').sort((a, b) => b.severityScore - a.severityScore),
        ].slice(0, 5);

        if (ordered.length === 0) {
            // Explicitly avoid generating empty tasks when analysis exists but has no actionable items.
            throw new BadRequestException({ message: 'No actionable mistakes or pronunciation issues found for this session' });
        }

        const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const created = await this.prisma.$transaction(async (tx) => {
            const tasks: any[] = [];
            for (const c of ordered) {
                if (c.kind === 'pronunciation') {
                    const task = await tx.learningTask.create({
                        data: {
                            userId,
                            sessionId,
                            type: 'pronunciation',
                            title: `Pronunciation: ${c.word}`,
                            content: {
                                sessionId,
                                userId,
                                type: 'pronunciation',
                                target: c.word,
                                userSaid: c.userSaid,
                                correct: c.correct,
                                severity: c.severity,
                                severityScore: c.severityScore,
                                repetition: c.repetition,
                                phonemes: {
                                    actual: c.phoneticActual ?? null,
                                    expected: c.phoneticExpected ?? null,
                                },
                            },
                            status: 'pending',
                            estimatedMinutes: 5,
                            dueDate,
                        },
                    });
                    await tx.taskPronunciationIssue.createMany({
                        data: c.issueIds.map((pronunciationIssueId) => ({
                            taskId: task.id,
                            pronunciationIssueId,
                        })),
                        skipDuplicates: true,
                    });
                    tasks.push(task);
                } else {
                    const task = await tx.learningTask.create({
                        data: {
                            userId,
                            sessionId,
                            type: c.kind,
                            title: `${c.kind === 'grammar' ? 'Grammar' : 'Vocabulary'}: ${c.phrase}`,
                            content: {
                                sessionId,
                                userId,
                                type: c.kind,
                                target: c.phrase,
                                userSaid: c.userSaid,
                                correct: c.correct,
                                severity: c.severity,
                                severityScore: c.severityScore,
                                repetition: c.repetition,
                            },
                            status: 'pending',
                            estimatedMinutes: 5,
                            dueDate,
                        },
                    });
                    await tx.taskMistake.createMany({
                        data: c.mistakeIds.map((mistakeId) => ({
                            taskId: task.id,
                            mistakeId,
                        })),
                        skipDuplicates: true,
                    });
                    tasks.push(task);
                }
            }
            return tasks;
        });

        const tasksWithLinks = await this.prisma.learningTask.findMany({
            where: { id: { in: created.map((t) => t.id) } },
            include: {
                mistakes: { include: { mistake: true } },
                pronunciationIssues: { include: { pronunciationIssue: true } },
            },
        });

        return [...tasksWithLinks].sort((a, b) => {
            const as = Number((a.content as any)?.severityScore ?? 0);
            const bs = Number((b.content as any)?.severityScore ?? 0);
            return bs - as;
        });
    }

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

    async getPendingTasksForUser(userId: string, limit = 10) {
        return this.prisma.learningTask.findMany({
            where: { userId, status: 'pending' },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                mistakes: { include: { mistake: true } },
                pronunciationIssues: { include: { pronunciationIssue: true } },
                session: { select: { id: true, createdAt: true } },
            },
        });
    }

    async completeTaskForUser(taskId: string, userId: string) {
        const task = await this.prisma.learningTask.findFirst({
            where: { id: taskId, userId },
            select: { id: true },
        });
        if (!task) throw new NotFoundException({ message: 'Task not found' });
        return this.prisma.learningTask.update({
            where: { id: taskId },
            data: { status: 'completed', completedAt: new Date() },
        });
    }
}
