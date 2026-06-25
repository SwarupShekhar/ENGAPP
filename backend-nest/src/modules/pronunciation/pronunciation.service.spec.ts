import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BrainService } from '../brain/brain.service';
import { WeaknessService } from '../reels/weakness.service';
import { PronunciationService } from './pronunciation.service';

describe('PronunciationService', () => {
  let service: PronunciationService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      pronunciationIssue: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PronunciationService,
        { provide: PrismaService, useValue: prisma },
        { provide: BrainService, useValue: { assessPronunciation: jest.fn() } },
        { provide: WeaknessService, useValue: { ingestWeakness: jest.fn() } },
      ],
    }).compile();

    service = module.get<PronunciationService>(PronunciationService);
  });

  it('persists flagged pronunciation errors with spoken/correct fields for mobile feedback', async () => {
    await (service as any).savePronunciationIssues('analysis-1', [
      {
        spoken: 'vater',
        correct: 'water',
        rule_category: 'w_to_v',
        reel_id: 'reel-1',
        confidence: 45,
      },
    ]);

    expect(prisma.pronunciationIssue.deleteMany).toHaveBeenCalledWith({
      where: { analysisId: 'analysis-1' },
    });
    expect(prisma.pronunciationIssue.createMany).toHaveBeenCalledWith({
      data: [
        {
          analysisId: 'analysis-1',
          word: 'vater',
          spoken: 'vater',
          correct: 'water',
          ruleCategory: 'w_to_v',
          reelId: 'reel-1',
          issueType: 'w_to_v',
          severity: 'medium',
          confidence: 45,
          suggestion: 'Practice "w" vs "v" (e.g. "wine" vs "vine")',
        },
      ],
    });
  });

  it('persists spoken-only flags when correct is absent (free-speech PA)', async () => {
    await (service as any).savePronunciationIssues('analysis-2', [
      {
        spoken: 'vater',
        rule_category: 'w_to_v',
        confidence: 40,
      },
    ]);

    expect(prisma.pronunciationIssue.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          analysisId: 'analysis-2',
          spoken: 'vater',
          correct: null,
          word: 'vater',
          ruleCategory: 'w_to_v',
        }),
      ],
    });
  });
});
