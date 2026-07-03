import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ScoreAuthorityService } from './score-authority.service';
import {
  applyAssessmentGating,
  computeOverall,
  flattenSkillBreakdown,
} from './score-authority.formulas';

const FIXTURE_USER_ID = 'user-score-authority-fixture';

describe('ScoreAuthorityService (spec §7 acceptance)', () => {
  let service: ScoreAuthorityService;
  let prisma: {
    userScoreProfile: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
    scoreChangeLog: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    user: { update: jest.Mock };
    userTopicScore: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };

  const assessmentBreakdown = {
    pronunciation: { phonemeAccuracy: 58 },
    fluency: { speechRate: 72 },
    grammar: { tenseControl: 83 },
    vocabulary: { lexicalRange: 0 },
    comprehension: 65,
  };

  beforeEach(async () => {
    process.env.SCORES_AUTHORITY_V1 = 'true';

    prisma = {
      userScoreProfile: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
      },
      scoreChangeLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
      userTopicScore: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoreAuthorityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ScoreAuthorityService);
  });

  afterEach(() => {
    delete process.env.SCORES_AUTHORITY_V1;
    delete process.env.SCORES_AUTHORITY_V1_USER_IDS;
  });

  it('§7.3 — assessment seed matches flattened breakdown post-gating', async () => {
    prisma.userScoreProfile.findUnique.mockResolvedValue(null);

    const result = await service.seedFromAssessment({
      userId: FIXTURE_USER_ID,
      assessmentId: 'assess-1',
      skillBreakdown: assessmentBreakdown,
      comprehensionScore: 65,
    });

    const expectedPillars = flattenSkillBreakdown(assessmentBreakdown);
    expectedPillars.comprehension = 65;
    const pillarsForOverall = { ...expectedPillars };
    let expectedOverall = computeOverall(pillarsForOverall);
    expectedOverall = applyAssessmentGating(pillarsForOverall, expectedOverall);

    expect(result?.pillars.pronunciation).toBe(expectedPillars.pronunciation);
    expect(result?.pillars.fluency).toBe(expectedPillars.fluency);
    expect(result?.pillars.grammar).toBe(expectedPillars.grammar);
    expect(result?.overall).toBe(expectedOverall);
    expect(prisma.userScoreProfile.upsert).toHaveBeenCalled();
    expect(prisma.scoreChangeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'assessment_seed' }),
      }),
    );
  });

  it('§7.1/§7.2 — getProfile overall and pillars are consistent', async () => {
    prisma.userScoreProfile.findUnique.mockResolvedValue({
      userId: FIXTURE_USER_ID,
      overallScore: 67,
      cefrLevel: 'B1',
      pronunciation: 58,
      fluency: 72,
      grammar: 83,
      vocabulary: 0,
      comprehension: 65,
      vocabularyMeasured: false,
      baselineAssessmentId: 'assess-1',
      lastEventType: 'call_delta',
      updatedAt: new Date('2026-07-03T10:00:00Z'),
    });

    const profile = await service.getProfile(FIXTURE_USER_ID);
    expect(profile.overall).toBe(67);
    expect(profile.pillars.pronunciation).toBe(58);
    expect(profile.pillars.fluency).toBe(72);
    expect(profile.pillars.grammar).toBe(83);
    expect(profile.pillars.vocabulary).toBe(0);
    expect(profile.pillars.comprehension).toBe(65);
    expect(profile.overall).toBe(67);
  });

  it('§7.4 — call deltas bounded; overall equals weighted sum', async () => {
    prisma.userScoreProfile.findUnique.mockResolvedValue({
      userId: FIXTURE_USER_ID,
      overallScore: 67,
      cefrLevel: 'B1',
      pronunciation: 58,
      fluency: 72,
      grammar: 83,
      vocabulary: 0,
      comprehension: 65,
      vocabularyMeasured: false,
      baselineAssessmentId: 'assess-1',
      lastEventType: 'assessment_seed',
      lastSessionId: null,
      pendingCefrLevel: null,
      cefrStableCount: 0,
    });

    const result = await service.applySessionDeltas(
      FIXTURE_USER_ID,
      {
        pronunciation: 5,
        fluency: 2,
        grammar: 1,
        vocabulary: 0,
        comprehension: 0,
      },
      'call_delta',
      'session-1',
    );

    expect(result).not.toBeNull();
    expect(result!.newScores.pronunciation).toBeLessThanOrEqual(100);
    expect(result!.newScores.pronunciation).toBe(63);
    expect(result!.newScores.overallScore).toBe(
      computeOverall({
        pronunciation: result!.newScores.pronunciation,
        fluency: result!.newScores.fluency,
        grammar: result!.newScores.grammar,
        vocabulary: result!.newScores.vocabulary,
        comprehension: result!.newScores.comprehension,
      }),
    );
  });

  it('§7.5 — reassessment fully replaces prior call deltas', async () => {
    prisma.userScoreProfile.findUnique.mockResolvedValue({
      userId: FIXTURE_USER_ID,
      overallScore: 75,
      cefrLevel: 'B2',
      pronunciation: 70,
      fluency: 80,
      grammar: 78,
      vocabulary: 60,
      comprehension: 70,
      vocabularyMeasured: true,
      baselineAssessmentId: 'assess-old',
      lastEventType: 'call_delta',
      lastSessionId: 'session-old',
      pendingCefrLevel: null,
      cefrStableCount: 0,
    });

    const reassessmentBreakdown = {
      pronunciation: { phonemeAccuracy: 45 },
      fluency: { speechRate: 40 },
      grammar: { tenseControl: 50 },
      vocabulary: { lexicalRange: 30 },
    };

    const result = await service.seedFromAssessment({
      userId: FIXTURE_USER_ID,
      assessmentId: 'assess-new',
      skillBreakdown: reassessmentBreakdown,
      comprehensionScore: 42,
    });

    const expected = flattenSkillBreakdown(reassessmentBreakdown);
    expected.comprehension = 42;
    expect(result?.pillars.pronunciation).toBe(expected.pronunciation);
    expect(result?.pillars.fluency).toBe(expected.fluency);
    expect(result?.overall).not.toBe(75);
  });

  it('§7.6 — maya_delta uses same rules as call_delta', async () => {
    const baseProfile = {
      userId: FIXTURE_USER_ID,
      overallScore: 60,
      cefrLevel: 'B1',
      pronunciation: 55,
      fluency: 60,
      grammar: 62,
      vocabulary: 40,
      comprehension: 50,
      vocabularyMeasured: true,
      baselineAssessmentId: 'assess-1',
      lastEventType: 'call_delta',
      lastSessionId: 'call-session',
      pendingCefrLevel: null,
      cefrStableCount: 0,
    };

    prisma.userScoreProfile.findUnique.mockResolvedValue({ ...baseProfile });
    const callResult = await service.applySessionDeltas(
      FIXTURE_USER_ID,
      { pronunciation: 1.5, fluency: 1, grammar: 0.5, vocabulary: 0, comprehension: 0 },
      'call_delta',
      'call-1',
    );

    prisma.userScoreProfile.findUnique.mockResolvedValue({ ...baseProfile });
    const mayaResult = await service.applySessionDeltas(
      FIXTURE_USER_ID,
      { pronunciation: 1.5, fluency: 1, grammar: 0.5, vocabulary: 0, comprehension: 0 },
      'maya_delta',
      'maya-1',
    );

    expect(callResult!.newScores).toEqual(mayaResult!.newScores);
    expect(prisma.scoreChangeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'maya_delta' }),
      }),
    );
  });

  describe('CEFR hysteresis', () => {
    it('requires 2 consecutive updates before band change', () => {
      const first = service.resolveCefrWithHysteresis('A2', null, 0, 58, false);
      expect(first.cefrLevel).toBe('A2');
      expect(first.pendingCefrLevel).toBe('B1');
      expect(first.cefrStableCount).toBe(1);

      const second = service.resolveCefrWithHysteresis(
        'A2',
        'B1',
        1,
        58,
        false,
      );
      expect(second.cefrLevel).toBe('B1');
      expect(second.pendingCefrLevel).toBeNull();
    });

    it('resets immediately on assessment seed', () => {
      const result = service.resolveCefrWithHysteresis('A2', 'B1', 1, 72, true);
      expect(result.cefrLevel).toBe('B2');
      expect(result.pendingCefrLevel).toBeNull();
      expect(result.cefrStableCount).toBe(0);
    });
  });
});
