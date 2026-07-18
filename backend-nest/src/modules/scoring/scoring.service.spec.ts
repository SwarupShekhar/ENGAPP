import { ScoringService } from './scoring.service';

describe('ScoringService session scores', () => {
  it('detects placeholder all-50 scores', () => {
    expect(
      ScoringService.isPlaceholderScores({
        overall_score: 50,
        grammar_score: 50,
        pronunciation_score: 50,
        fluency_score: 50,
        vocabulary_score: 50,
      }),
    ).toBe(true);
  });

  it('does not treat real varied scores as placeholders', () => {
    expect(
      ScoringService.isPlaceholderScores({
        overall_score: 67,
        grammar_score: 80,
        pronunciation_score: 90,
        fluency_score: 55,
        vocabulary_score: 40,
      }),
    ).toBe(false);
  });

  it('estimates low fluency for trivial speech', () => {
    expect(
      ScoringService.estimateFluencyFromText(['hello', 'hi', 'yes']),
    ).toBeLessThanOrEqual(20);
  });

  it('builds non-placeholder scores from CQS without Azure PA', () => {
    const svc = Object.create(ScoringService.prototype) as ScoringService;
    const turns = [
      'I went to the market yesterday and bought some vegetables for dinner.',
      'What about you? Did you do anything interesting over the weekend?',
    ];
    const scores = svc.buildSessionScoresFromCqs(
      {
        pqs: { pqs: 0, word_count: 0, mean_fluency: 0 },
        ds: 42,
        cs: 38,
        es: 55,
        grammar_signal: 72,
        fluency_signal: 0,
      },
      48,
      turns,
    );
    expect(scores.source).toBe('cqs');
    expect(scores.pronunciationMeasured).toBe(false);
    expect(scores.grammar).toBe(72);
    expect(scores.vocabulary).toBeGreaterThan(0);
    expect(scores.fluency).toBeGreaterThan(0);
    expect(scores.overall_score).toBeGreaterThan(0);
    expect(ScoringService.isPlaceholderScores(scores as any)).toBe(false);
  });

  it('uses pronunciation when Azure PA word_count > 0', () => {
    const svc = Object.create(ScoringService.prototype) as ScoringService;
    const scores = svc.buildSessionScoresFromCqs(
      {
        pqs: { pqs: 81, word_count: 40, mean_fluency: 78 },
        ds: 50,
        cs: 45,
        es: 60,
        grammar_signal: 70,
        fluency_signal: 76,
      },
      72,
      ['I practice English every day with my friends.'],
    );
    expect(scores.pronunciationMeasured).toBe(true);
    expect(scores.pronunciation).toBe(81);
    expect(scores.overall_score).toBeGreaterThan(50);
  });

  it('estimates pronunciation from issue count when Azure PA absent', () => {
    const svc = Object.create(ScoringService.prototype) as ScoringService;
    const turns = [
      'I went to the market yesterday and bought some vegetables for dinner.',
      'What about you? Did you do anything interesting over the weekend?',
    ];
    const scores = svc.buildSessionScoresFromCqs(
      {
        pqs: { pqs: 0, word_count: 0, mean_fluency: 0 },
        ds: 42,
        cs: 38,
        grammar_signal: 72,
        fluency_signal: 65,
      },
      48,
      turns,
      { pronunciationIssueCount: 4, transcriptWordCount: 20 },
    );
    expect(scores.pronunciationMeasured).toBe(true);
    expect(scores.pronunciationEstimated).toBe(true);
    expect(scores.pronunciation).toBe(40);
    expect(scores.pronunciation).toBeGreaterThan(0);
  });

  it('passes fluency through when pronunciation is low (no TS cross-pillar cap)', () => {
    const svc = Object.create(ScoringService.prototype) as ScoringService;
    const scores = svc.buildSessionScoresFromCqs(
      {
        pqs: { pqs: 30, word_count: 40, mean_fluency: 90 },
        ds: 50,
        grammar_signal: 70,
        fluency_signal: 90,
      },
      60,
      ['I practice English every day with my friends and colleagues.'],
    );
    expect(scores.pronunciation).toBe(30);
    expect(scores.fluency).toBe(90);
    expect(scores.grammar).toBe(70);
    expect(scores.vocabulary).toBe(40);
    // Renormalized weighted overall of the pass-through inputs.
    expect(scores.overall_score).toBe(
      Math.round((90 * 0.25 + 70 * 0.22 + 30 * 0.22 + 40 * 0.18) / 0.87),
    );
  });

  it('passes fluency through when pronunciation is below 55 (no TS cross-pillar cap)', () => {
    const svc = Object.create(ScoringService.prototype) as ScoringService;
    const scores = svc.buildSessionScoresFromCqs(
      {
        pqs: { pqs: 50, word_count: 40, mean_fluency: 85 },
        ds: 50,
        grammar_signal: 70,
        fluency_signal: 85,
      },
      65,
      ['I practice English every day with my friends and colleagues.'],
    );
    expect(scores.pronunciation).toBe(50);
    expect(scores.fluency).toBe(85);
    expect(scores.grammar).toBe(70);
    expect(scores.vocabulary).toBe(40);
    expect(scores.overall_score).toBe(
      Math.round((85 * 0.25 + 70 * 0.22 + 50 * 0.22 + 40 * 0.18) / 0.87),
    );
  });

  it('passes vocabulary through when grammar is below 50 (no TS cross-pillar cap)', () => {
    const svc = Object.create(ScoringService.prototype) as ScoringService;
    const scores = svc.buildSessionScoresFromCqs(
      {
        pqs: { pqs: 75, word_count: 40, mean_fluency: 70 },
        ds: 80,
        grammar_signal: 38,
        fluency_signal: 70,
      },
      55,
      ['I practice English every day with my friends.'],
    );
    expect(scores.grammar).toBe(38);
    expect(scores.vocabulary).toBe(64);
    expect(scores.fluency).toBe(70);
    expect(scores.pronunciation).toBe(75);
    expect(scores.overall_score).toBe(
      Math.round((70 * 0.25 + 38 * 0.22 + 75 * 0.22 + 64 * 0.18) / 0.87),
    );
  });

  it('passes fluency through when grammar is broken (no TS cross-pillar cap)', () => {
    const svc = Object.create(ScoringService.prototype) as ScoringService;
    const scores = svc.buildSessionScoresFromCqs(
      {
        pqs: { pqs: 60, word_count: 40, mean_fluency: 88 },
        ds: 80,
        grammar_signal: 24,
        fluency_signal: 70,
        vocabulary_signal: 20,
      },
      50,
      ['i have english no speak and is is very uh stuff'],
    );
    expect(scores.grammar).toBe(24);
    expect(scores.fluency).toBe(70);
    expect(scores.vocabulary).toBe(20);
    expect(scores.pronunciation).toBe(60);
    expect(scores.comprehensionMeasured).toBe(false);
    expect(scores.overall_score).toBe(
      Math.round((70 * 0.25 + 24 * 0.22 + 60 * 0.22 + 20 * 0.18) / 0.87),
    );
  });

  it('keeps pillars independent: low grammar does not cap high fluency', () => {
    const svc = Object.create(ScoringService.prototype) as ScoringService;
    const scores = svc.buildSessionScoresFromCqs(
      {
        pqs: { pqs: 80, word_count: 40, mean_fluency: 88 },
        grammar_signal: 20,
        fluency_signal: 88,
        vocabulary_signal: 25,
      },
      70,
      ['I practice English every day with my friends and colleagues.'],
    );
    expect(scores.pronunciation).toBe(80);
    expect(scores.fluency).toBe(88);
    expect(scores.grammar).toBe(20);
    expect(scores.vocabulary).toBe(25);
    expect(scores.comprehensionMeasured).toBe(false);
    expect(scores.overall_score).toBe(
      Math.round((88 * 0.25 + 20 * 0.22 + 80 * 0.22 + 25 * 0.18) / 0.87),
    );
  });

  it('reports grammar not_measured on LLM fallback and excludes it from overall', () => {
    const svc = Object.create(ScoringService.prototype) as ScoringService;
    const scores = svc.buildSessionScoresFromCqs(
      {
        pqs: { pqs: 80, word_count: 40, mean_fluency: 88 },
        grammar_signal: null,
        grammar_measured: false,
        fluency_signal: 88,
        vocabulary_signal: 25,
      },
      70,
      ['I practice English every day with my friends and colleagues.'],
    );
    // No fake structural ~70 — grammar is not measured.
    expect(scores.grammarMeasured).toBe(false);
    expect(scores.grammar).toBe(0);
    // Grammar weight (0.22) is dropped and the rest renormalized.
    expect(scores.overall_score).toBe(
      Math.round((88 * 0.25 + 80 * 0.22 + 25 * 0.18) / (0.25 + 0.22 + 0.18)),
    );
  });

  it('marks grammar measured when the LLM score is present (even if low)', () => {
    const svc = Object.create(ScoringService.prototype) as ScoringService;
    const scores = svc.buildSessionScoresFromCqs(
      {
        pqs: { pqs: 60, word_count: 40, mean_fluency: 70 },
        grammar_signal: 12,
        grammar_measured: true,
        fluency_signal: 70,
        vocabulary_signal: 27,
      },
      50,
      ['i english no speak'],
    );
    expect(scores.grammarMeasured).toBe(true);
    expect(scores.grammar).toBe(12);
  });

  describe('PA backfill skip helpers', () => {
    it('treats CQS pqs > 0 as PA word measurement', () => {
      expect(ScoringService.cqsRowHasPaWordMeasurement({ pqs: 72 })).toBe(true);
      expect(ScoringService.cqsRowHasPaWordMeasurement({ pqs: 0 })).toBe(false);
      expect(ScoringService.cqsRowHasPaWordMeasurement(null)).toBe(false);
    });

    it('shouldSkipPaBackfill requires CQS PA and delivery insights', async () => {
      const prisma = {
        analysis: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ rawData: { deliveryInsights: [{ text: 'slow down' }] } }),
        },
      };
      const svc = Object.assign(Object.create(ScoringService.prototype), {
        prisma,
      }) as ScoringService;

      await expect(
        svc.shouldSkipPaBackfill('p1', { pqs: 0 }),
      ).resolves.toBe(false);
      await expect(
        svc.shouldSkipPaBackfill('p1', { pqs: 80 }),
      ).resolves.toBe(true);

      prisma.analysis.findUnique.mockResolvedValueOnce({ rawData: {} });
      await expect(
        svc.shouldSkipPaBackfill('p1', { pqs: 80 }),
      ).resolves.toBe(false);
    });
  });
});
