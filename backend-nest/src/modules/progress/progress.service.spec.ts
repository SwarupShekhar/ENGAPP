import { Test, TestingModule } from '@nestjs/testing';
import { ProgressService, PillarDeltas } from './progress.service';
import { PrismaService } from '../../database/prisma/prisma.service';

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
      
      expect(result.newScores.pronunciation).toBe(52);
      expect(result.newScores.fluency).toBe(52); // Math.round handles clamp output, but wait clamp takes ints? Math.round(51.5) = 52
      expect(result.newScores.grammar).toBe(50);
      expect(result.newScores.vocabulary).toBe(51);
      expect(result.newScores.comprehension).toBe(51); // 50.5 rounds to 51
      
      expect(result.isGatingActive).toBe(false);

      // weights applied on clamped (rounded) integers:
      // fluency*0.25(52 -> 13) + grammar*0.22(50 -> 11) + pron*0.22(52 -> 11.44) + vocab*0.18(51 -> 9.18) + comp*0.13(51 -> 6.63)
      // 13 + 11 + 11.44 + 9.18 + 6.63 = 51.25 * 10 = 512.5 -> 513
      expect(result.newScores.overallScore).toBe(513);
    });

    it('Test case 2: User with pronunciation at 32, apply +1 (still < 35)', async () => {
      jest.spyOn(service, 'getDetailedMetrics').mockResolvedValue({
        current: { pronunciation: 32, fluency: 50, grammar: 50, vocabulary: 50, comprehension: 50 }
      } as any);

      const result = await service.applyPillarDeltas('user-123', {
        pronunciation: 1, fluency: 0, grammar: 0, vocabulary: 0, comprehension: 0
      });

      expect(result.newScores.pronunciation).toBe(33);
      expect(result.isGatingActive).toBe(true);
      expect(result.newScores.overallScore).toBe(370); // Capped at 370
    });

    it('Test case 3: User with pronunciation at 34, apply +2 (now >= 35)', async () => {
      jest.spyOn(service, 'getDetailedMetrics').mockResolvedValue({
        current: { pronunciation: 34, fluency: 50, grammar: 50, vocabulary: 50, comprehension: 50 }
      } as any);

      const result = await service.applyPillarDeltas('user-123', {
        pronunciation: 2, fluency: 0, grammar: 0, vocabulary: 0, comprehension: 0
      });

      expect(result.newScores.pronunciation).toBe(36);
      expect(result.isGatingActive).toBe(false);
      // Not capped. Calculate overall expected:
      // fluency(50)*0.25 (12.5) + grammar(50)*0.22 (11) + pron(36)*0.22 (7.92) + vocab(50)*0.18 (9) + comp(50)*0.13 (6.5)
      // sum = 46.92 * 10 = 469.2 -> 469
      expect(result.newScores.overallScore).toBe(469);
    });

    it('Test case 4: Score clamping (apply +100 to 80)', async () => {
      jest.spyOn(service, 'getDetailedMetrics').mockResolvedValue({
        current: { pronunciation: 80, fluency: 50, grammar: 50, vocabulary: 50, comprehension: 50 }
      } as any);

      const result = await service.applyPillarDeltas('user-123', {
        pronunciation: 100, fluency: 0, grammar: 0, vocabulary: 0, comprehension: 0
      });

      expect(result.newScores.pronunciation).toBe(100); // 80 + 100 clamped to 100
    });
  });
});
