import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { WordOfDayService } from '../home/services/word-of-day.service';
import { PhraseOfDayService } from '../home/services/phrase-of-day.service';
import { applySrTransition } from '../tasks/sr-scheduler';

export interface CoachingTask {
  id: string;
  type: string;
  focusWords: string[];
  target: string;
  userSaid: string;
}

export interface PreloadedHint {
  id: string;
  taskId: string | null;
  text: string;
  trigger: string;
  watchPhrase: string;
  markField: string | null;
}

export interface CoachingContext {
  userId: string;
  sessionId: string;
  activeTasks: CoachingTask[];
  phraseOfDay: { phrase: string; example: string } | null;
  wordOfDay: { word: string; definition: string } | null;
  usedPhraseOfDay: boolean;
  usedWordOfDay: boolean;
  hintCount: number;
  lastHintAt: string | null;
}

@Injectable()
export class InCallCoachingService {
  private readonly logger = new Logger(InCallCoachingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly wordOfDay: WordOfDayService,
    private readonly phraseOfDay: PhraseOfDayService,
  ) {}

  cacheKey(userId: string, sessionId: string): string {
    return `coaching:${userId}:${sessionId}`;
  }

  async buildContext(userId: string, sessionId: string): Promise<CoachingContext> {
    const [tasks, phrase, word] = await Promise.all([
      this.getActiveTasks(userId),
      this.phraseOfDay.getPhraseOfTheDay().catch(() => null),
      this.wordOfDay.getWordOfTheDay().catch(() => null),
    ]);

    const context: CoachingContext = {
      userId,
      sessionId,
      activeTasks: tasks,
      phraseOfDay: phrase ? { phrase: phrase.phrase, example: phrase.example } : null,
      wordOfDay: word ? { word: word.word, definition: word.definition } : null,
      usedPhraseOfDay: false,
      usedWordOfDay: false,
      hintCount: 0,
      lastHintAt: null,
    };

    await this.redis.set(this.cacheKey(userId, sessionId), JSON.stringify(context), 4 * 60 * 60);
    this.logger.log(
      `[Coaching] context built for user=${userId} session=${sessionId} tasks=${tasks.length}`,
    );
    return context;
  }

  async getContext(userId: string, sessionId: string): Promise<CoachingContext | null> {
    const raw = await this.redis.get(this.cacheKey(userId, sessionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CoachingContext;
    } catch {
      return null;
    }
  }

  private async getActiveTasks(userId: string): Promise<CoachingTask[]> {
    const rows = await this.prisma.learningTask.findMany({
      where: { userId, srState: 'LEARNING', status: 'pending' },
      orderBy: { dueAt: 'asc' },
      take: 10,
    });
    return rows
      .map((r) => {
        const c = (r.content as any) ?? {};
        return {
          id: r.id,
          type: r.type,
          focusWords: (c.focusWords as string[]) ?? [],
          target: String(c.target ?? c.correct ?? ''),
          userSaid: String(c.userSaid ?? ''),
        };
      })
      .filter((t) => t.focusWords.length > 0 || t.userSaid);
  }

  async confirmHintUsed(userId: string, sessionId: string, taskId: string | null | undefined): Promise<void> {
    if (!taskId) {
      this.logger.log(`[Coaching] hint confirmed (no taskId) user=${userId}`);
      return;
    }
    try {
      const task = await this.prisma.learningTask.findFirst({
        where: { id: taskId, userId },
      });
      if (!task) return;

      const sr = applySrTransition(
        {
          srState: task.srState as 'LEARNING' | 'GRADUATED',
          srStep: task.srStep,
          correctStreak: task.correctStreak,
          lastAttemptAt: task.lastAttemptAt,
        },
        true, // pass = true — they used the phrase
        new Date(),
      );

      await this.prisma.learningTask.update({
        where: { id: task.id },
        data: {
          srState: sr.srState,
          srStep: sr.srStep,
          correctStreak: sr.correctStreak,
          dueAt: sr.dueAt,
          lastAttemptAt: sr.lastAttemptAt,
          lastResult: sr.lastResult,
          attemptCount: { increment: 1 },
          status: sr.graduated ? 'completed' : task.status,
          completedAt: sr.graduated ? new Date() : task.completedAt,
        },
      });
      this.logger.log(`[Coaching] SR credited task=${taskId} streak=${sr.correctStreak} graduated=${sr.graduated}`);
    } catch (e) {
      this.logger.warn(`[Coaching] confirmHintUsed failed: ${(e as Error).message}`);
    }
  }

  async getHintsPreload(userId: string, sessionId: string): Promise<PreloadedHint[]> {
    let ctx = await this.getContext(userId, sessionId);
    if (!ctx) ctx = await this.buildContext(userId, sessionId);

    const clip = (s: string, n = 32) => (s.length > n ? `${s.slice(0, n)}…` : s);
    const hints: PreloadedHint[] = [];

    // Past-mistake hints — top 3, most overdue first (already ordered by dueAt asc)
    for (const task of ctx.activeTasks.slice(0, 3)) {
      if (!task.userSaid || !task.target) continue;
      hints.push({
        id: `task-${task.id}`,
        taskId: task.id,
        text: `You sometimes say "${clip(task.userSaid)}" — try "${clip(task.target)}"`,
        trigger: 'past_mistake',
        watchPhrase: task.target.toLowerCase(),
        markField: null,
      });
    }

    // Phrase of day nudge (only if not already used)
    if (ctx.phraseOfDay && !ctx.usedPhraseOfDay) {
      hints.push({
        id: 'phrase-of-day',
        taskId: null,
        text: `Today's phrase to try: "${ctx.phraseOfDay.phrase}"`,
        trigger: 'phrase_of_day',
        watchPhrase: ctx.phraseOfDay.phrase.toLowerCase(),
        markField: 'usedPhraseOfDay',
      });
    }

    return hints;
  }

  async scanTranscriptForCredits(
    userId: string,
    sessionId: string,
    segments: string[],
  ): Promise<void> {
    const ctx = await this.getContext(userId, sessionId);
    if (!ctx || !segments.length) return;

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '');
    const fullText = norm(segments.join(' '));
    const ctxUpdates: Partial<CoachingContext> = {};

    for (const task of ctx.activeTasks) {
      const target = norm(task.target);
      if (!target) continue;
      if (fullText.includes(target)) {
        await this.confirmHintUsed(userId, sessionId, task.id);
        this.logger.log(`[Coaching] P2P transcript credited task=${task.id}`);
      }
    }

    if (ctx.phraseOfDay && !ctx.usedPhraseOfDay) {
      const phrase = norm(ctx.phraseOfDay.phrase);
      if (fullText.includes(phrase)) {
        ctxUpdates.usedPhraseOfDay = true;
        this.logger.log(`[Coaching] P2P phrase-of-day confirmed user=${userId}`);
      }
    }

    if (ctx.wordOfDay && !ctx.usedWordOfDay) {
      const word = norm(ctx.wordOfDay.word);
      if (word && fullText.includes(word)) {
        ctxUpdates.usedWordOfDay = true;
      }
    }

    if (Object.keys(ctxUpdates).length > 0) {
      await this.redis.set(
        this.cacheKey(userId, sessionId),
        JSON.stringify({ ...ctx, ...ctxUpdates }),
        4 * 60 * 60,
      );
    }
  }

  async getCallSummary(userId: string, sessionId: string) {
    const ctx = await this.getContext(userId, sessionId);
    if (!ctx) return { hintsShown: 0, phrasesUsed: 0, phrasesAttempted: [], message: null };

    const phrasesUsed: string[] = [];
    if (ctx.usedPhraseOfDay && ctx.phraseOfDay) phrasesUsed.push(ctx.phraseOfDay.phrase);
    if (ctx.usedWordOfDay && ctx.wordOfDay) phrasesUsed.push(ctx.wordOfDay.word);

    const hintsShown = ctx.hintCount ?? 0;
    const message = phrasesUsed.length > 0
      ? `You used ${phrasesUsed.map((p) => `"${p}"`).join(' and ')} during the call!`
      : hintsShown > 0
      ? "Keep practicing — you'll nail it next call."
      : null;

    return {
      hintsShown,
      phrasesUsed: phrasesUsed.length,
      phrasesAttempted: phrasesUsed,
      message,
    };
  }
}
