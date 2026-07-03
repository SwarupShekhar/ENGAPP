import { Test, TestingModule } from '@nestjs/testing';
import { ProgressService, PillarDeltas } from './progress.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ScoreAuthorityService } from '../score-authority/score-authority.service';

describe('ProgressService', () => {
  let service: ProgressService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressService,
        {
          provide: PrismaService,
          useValue: {
            assessmentSession: { findFirst: jest.fn() },
            conversationSession: { findFirst: jest.fn(), update: jest.fn() },
            sessionParticipant: { findMany: jest.fn() },
            userReliability: { findUnique: jest.fn() },
            profile: { findUnique: jest.fn() },
          },
        },
        {
          provide: ScoreAuthorityService,
          useValue: {
            isEnabledForUser: jest.fn().mockReturnValue(false),
            applySessionDeltas: jest.fn(),
            getProfile: jest.fn(),
            toDetailedMetricsCurrent: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProgressService>(ProgressService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('applyPillarDeltas', () => {

    it('Test case 1: User at 50/50/50/50/50 across all pillars', async () => {
      // Setup mock
      jest.spyOn(service, 'getDetailedMetrics').mockResolvedValue({
        current: { pronunciation: 50, fluency: 50, grammar: 50, vocabulary: 50, comprehension: 50 }
      } as any);

      const deltas: PillarDeltas = {
        pronunciation: 2,
        fluency: 1.5,
        grammar: 0,
        vocabulary: 1,
        comprehension: 0.5,
      };

      const result = await service.applyPillarDeltas('user-123', deltas);
      const newScores = result.newScores as {
        pronunciation: number;
        fluency: number;
        grammar: number;
        vocabulary: number;
        comprehension: number;
        overallScore: number;
      };
      
      expect(newScores.pronunciation).toBe(52);
      expect(newScores.fluency).toBe(52);
      expect(newScores.grammar).toBe(50);
      expect(newScores.vocabulary).toBe(51);
      expect(newScores.comprehension).toBe(51);
      
      expect(result.isGatingActive).toBe(false);
      expect(newScores.overallScore).toBe(513);
    });

    it('Test case 2: User with pronunciation at 32, apply +1 (still < 35)', async () => {
      jest.spyOn(service, 'getDetailedMetrics').mockResolvedValue({
        current: { pronunciation: 32, fluency: 50, grammar: 50, vocabulary: 50, comprehension: 50 }
      } as any);

      const result = await service.applyPillarDeltas('user-123', {
        pronunciation: 1, fluency: 0, grammar: 0, vocabulary: 0, comprehension: 0
      });

      expect((result.newScores as any).pronunciation).toBe(33);
      expect(result.isGatingActive).toBe(true);
      expect(result.newScores.overallScore).toBe(370);
    });

    it('Test case 3: User with pronunciation at 34, apply +2 (now >= 35)', async () => {
      jest.spyOn(service, 'getDetailedMetrics').mockResolvedValue({
        current: { pronunciation: 34, fluency: 50, grammar: 50, vocabulary: 50, comprehension: 50 }
      } as any);

      const result = await service.applyPillarDeltas('user-123', {
        pronunciation: 2, fluency: 0, grammar: 0, vocabulary: 0, comprehension: 0
      });

      expect((result.newScores as any).pronunciation).toBe(36);
      expect(result.isGatingActive).toBe(false);
      expect(result.newScores.overallScore).toBe(469);
    });

    it('Test case 4: Score clamping (apply +100 to 80)', async () => {
      jest.spyOn(service, 'getDetailedMetrics').mockResolvedValue({
        current: { pronunciation: 80, fluency: 50, grammar: 50, vocabulary: 50, comprehension: 50 }
      } as any);

      const result = await service.applyPillarDeltas('user-123', {
        pronunciation: 100, fluency: 0, grammar: 0, vocabulary: 0, comprehension: 0
      });

      expect((result.newScores as any).pronunciation).toBe(100);
    });
  });
});
