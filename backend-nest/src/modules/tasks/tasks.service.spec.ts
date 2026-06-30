import { Test } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BrainService } from '../brain/brain.service';
import { PronunciationService } from '../pronunciation/pronunciation.service';
import { PointsService } from '../gamification/points.service';

describe('TasksService SR', () => {
  let service: TasksService;
  const prisma = {
    learningTask: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
  };
  const brain = { judgeCorrection: jest.fn() };
  const pronunciation = { assessFromUploadedFile: jest.fn() };
  const points = { awardPoints: jest.fn() };

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: BrainService, useValue: brain },
        { provide: PronunciationService, useValue: pronunciation },
        { provide: PointsService, useValue: points },
      ],
    }).compile();
    service = mod.get(TasksService);
    jest.clearAllMocks();
  });

  it('computeMistakeKey is stable for pronunciation', () => {
    const k = service.computeMistakeKey({
      type: 'pronunciation',
      content: { correct: 'People', rule_category: 'i_to_ee' },
    });
    expect(k).toBe('pron:i_to_ee:people');
  });

  it('computeMistakeKey uses original→corrected for grammar', () => {
    const k = service.computeMistakeKey({
      type: 'grammar',
      content: { userSaid: 'I goed', correct: 'I went' },
    });
    expect(k).toBe('grammar:i goed→i went');
  });

  it('getDueTasksForUser queries LEARNING + dueAt<=now and orders by type then severity', async () => {
    prisma.learningTask.findMany.mockResolvedValue([
      {
        id: 'v1',
        type: 'vocabulary',
        content: { severityScore: 90 },
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'p1',
        type: 'pronunciation',
        content: { severityScore: 10 },
        createdAt: new Date('2026-01-02'),
      },
      {
        id: 'g1',
        type: 'grammar',
        content: { severityScore: 50 },
        createdAt: new Date('2026-01-03'),
      },
    ]);
    const rows = await service.getDueTasksForUser('u1', 10);
    const arg = prisma.learningTask.findMany.mock.calls[0][0];
    expect(arg.where.userId).toBe('u1');
    expect(arg.where.srState).toBe('LEARNING');
    expect(arg.where.dueAt.lte).toBeInstanceOf(Date);
    expect(arg.take).toBe(50);
    expect(arg.orderBy).toEqual({ dueAt: 'asc' });
    expect(rows.map((r) => r.id)).toEqual(['p1', 'g1', 'v1']);
  });

  it('grammar attempt: judge pass applies SR transition + persists', async () => {
    prisma.learningTask.findFirst.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      type: 'grammar',
      status: 'pending',
      srState: 'LEARNING',
      srStep: 0,
      correctStreak: 0,
      lastAttemptAt: null,
      completedAt: null,
      content: { userSaid: 'I goed', correct: 'I went', target: 'I went there' },
    });
    brain.judgeCorrection.mockResolvedValue({ pass: true, reason: 'ok', errored: false });
    prisma.learningTask.update.mockResolvedValue({});
    const r = await service.submitAttempt('t1', 'u1', { transcript: 'I went there' });
    expect(r.pass).toBe(true);
    expect(r.correctStreak).toBe(1);
    expect(r.graduated).toBe(true);
    expect(prisma.learningTask.update).toHaveBeenCalled();
  });

  it('unparseable judge response does NOT mutate SR state', async () => {
    prisma.learningTask.findFirst.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      type: 'grammar',
      srState: 'LEARNING',
      srStep: 1,
      correctStreak: 1,
      lastAttemptAt: null,
      content: { userSaid: 'x', correct: 'y', target: 'y' },
    });
    brain.judgeCorrection.mockResolvedValue({ pass: false, reason: 'judge_error', errored: true });
    const r = await service.submitAttempt('t1', 'u1', { transcript: 'whatever' });
    expect(r.errored).toBe(true);
    expect(prisma.learningTask.update).not.toHaveBeenCalled();
  });

  it('judge scoring error does NOT mutate SR state', async () => {
    prisma.learningTask.findFirst.mockResolvedValue({
      id: 't1',
      userId: 'u1',
      type: 'grammar',
      srState: 'LEARNING',
      srStep: 1,
      correctStreak: 1,
      lastAttemptAt: null,
      content: { correct: 'x', target: 'x' },
    });
    brain.judgeCorrection.mockResolvedValue({ pass: false, reason: 'judge_error', errored: true });
    const r = await service.submitAttempt('t1', 'u1', { transcript: 'whatever' });
    expect(r.errored).toBe(true);
    expect(prisma.learningTask.update).not.toHaveBeenCalled();
  });

  it('reactivateOnRecurrence flips GRADUATED→LEARNING by mistakeKey', async () => {
    prisma.learningTask.findFirst.mockResolvedValue({ id: 'g1', srState: 'GRADUATED' });
    prisma.learningTask.update.mockResolvedValue({});
    const did = await service.reactivateOnRecurrence('u1', 'pron:i_to_ee:people');
    expect(did).toBe(true);
    const arg = prisma.learningTask.update.mock.calls[0][0];
    expect(arg.data.srState).toBe('LEARNING');
    expect(arg.data.srStep).toBe(0);
    expect(arg.data.correctStreak).toBe(0);
  });
});
