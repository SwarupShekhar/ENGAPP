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
});
