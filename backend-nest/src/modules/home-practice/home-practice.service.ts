import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PronunciationService } from '../pronunciation/pronunciation.service';
import { WordOfDayService } from '../home/services/word-of-day.service';
import { PhraseOfDayService } from '../home/services/phrase-of-day.service';
import { applySrTransition } from '../tasks/sr-scheduler';

const THRESHOLD_DAILY = 70;
const THRESHOLD_MISTAKE = 75;
const THRESHOLD_FOCUS_WORD = 70;
const MISTAKE_STREAK_TARGET = 2;

@Injectable()
export class HomePracticeService {
  private readonly logger = new Logger(HomePracticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pronunciation: PronunciationService,
    private readonly wordOfDay: WordOfDayService,
    private readonly phraseOfDay: PhraseOfDayService,
  ) {}

  async getPracticeStatus(userId: string) {
    const today = new Date();
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const rows = await this.prisma.userDailyPracticeCompletion.findMany({
      where: { userId, practiceDate: date },
    });
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r]));
    return {
      date: date.toISOString().slice(0, 10),
      phrase: {
        done: !!byKind['phrase'],
        completedAt: byKind['phrase']?.completedAt?.toISOString(),
        bestScore: byKind['phrase']?.bestScore ?? undefined,
      },
      word: {
        done: !!byKind['word'],
        completedAt: byKind['word']?.completedAt?.toISOString(),
        bestScore: byKind['word']?.bestScore ?? undefined,
      },
    };
  }

  async assess(
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    cardType: 'phrase_daily' | 'word_daily' | 'mistake_task',
    clientReferenceText: string,
    taskId?: string,
  ) {
    let referenceText: string;
    let focusWords: string[] = [];
    let taskRow: any = null;

    if (cardType === 'phrase_daily') {
      const phrase = await this.phraseOfDay.getPhraseOfTheDay();
      referenceText = phrase.phrase;
    } else if (cardType === 'word_daily') {
      const word = await this.wordOfDay.getWordOfTheDay();
      referenceText = word.word;
    } else {
      if (!taskId) throw new NotFoundException('taskId required for mistake_task');
      taskRow = await this.prisma.learningTask.findFirst({ where: { id: taskId, userId } });
      if (!taskRow) throw new NotFoundException('Task not found');
      const content = (taskRow.content as any) ?? {};
      referenceText = content.referenceText || content.target || clientReferenceText;
      focusWords = (content.focusWords as string[]) ?? [];
      if (!focusWords.length && content.userSaid && content.correct) {
        focusWords = this.deriveFocusWords(content.userSaid, content.correct);
      }
    }

    const result = await this.pronunciation.assessFromUploadedFileWithWords(userId, file, referenceText);
    if (result.errored) {
      return { pass: false, errored: true, overallAccuracy: 0, focusWords: [], message: 'Assessment failed — try again' };
    }

    const threshold = cardType === 'mistake_task' ? THRESHOLD_MISTAKE : THRESHOLD_DAILY;
    let pass = result.accuracy >= threshold;

    const focusWordResults = focusWords.map((fw) => {
      const match = result.words.find((w) => w.word === fw.toLowerCase());
      const acc = match?.accuracy ?? 0;
      return { word: fw, accuracy: acc, pass: acc >= THRESHOLD_FOCUS_WORD };
    });
    if (pass && focusWords.length > 0) {
      pass = focusWordResults.every((fw) => fw.pass);
    }

    let correctStreak = 0;
    const streakTarget = MISTAKE_STREAK_TARGET;
    let doneForToday = false;
    let message = '';

    if (cardType === 'phrase_daily' || cardType === 'word_daily') {
      const kind = cardType === 'phrase_daily' ? 'phrase' : 'word';
      if (pass) {
        const now = new Date();
        const practiceDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        await this.prisma.userDailyPracticeCompletion.upsert({
          where: { userId_kind_practiceDate: { userId, kind, practiceDate } },
          create: { userId, kind, practiceDate, bestScore: result.accuracy },
          update: { bestScore: result.accuracy, completedAt: new Date() },
        });
        doneForToday = true;
        message = 'Great — see you tomorrow';
      }
    } else if (taskRow) {
      const sr = applySrTransition(
        {
          srState: taskRow.srState as 'LEARNING' | 'GRADUATED',
          srStep: taskRow.srStep,
          correctStreak: taskRow.correctStreak,
          lastAttemptAt: taskRow.lastAttemptAt,
        },
        pass,
        new Date(),
      );
      correctStreak = sr.correctStreak;
      doneForToday = sr.graduated || correctStreak >= MISTAKE_STREAK_TARGET;
      await this.prisma.learningTask.update({
        where: { id: taskRow.id },
        data: {
          srState: sr.srState,
          srStep: sr.srStep,
          correctStreak: sr.correctStreak,
          dueAt: sr.dueAt,
          lastAttemptAt: sr.lastAttemptAt,
          lastResult: sr.lastResult,
          attemptCount: { increment: 1 },
          status: sr.graduated ? 'completed' : taskRow.status,
          completedAt: sr.graduated ? new Date() : taskRow.completedAt,
        },
      });
      if (doneForToday) message = 'Nice work! Mistake mastered';
      else if (pass) message = `${correctStreak}/${MISTAKE_STREAK_TARGET} — once more`;
    }

    return {
      pass,
      errored: false,
      overallAccuracy: Math.round(result.accuracy),
      focusWords: focusWordResults,
      correctStreak,
      streakTarget,
      doneForToday,
      message,
      prosody: result.prosodyScore !== null
        ? { fluency: result.fluencyScore, prosody: result.prosodyScore }
        : undefined,
    };
  }

  private deriveFocusWords(userSaid: string, correct: string, cap = 5): string[] {
    const userTokens = new Set(userSaid.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean));
    const correctTokens = correct.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
    const diff = correctTokens.filter((t) => !userTokens.has(t));
    return (diff.length ? diff : correctTokens).slice(0, cap);
  }
}
