import {
  applyAssessmentGating,
  clampScore,
  computeGoalProgress,
  computeOverall,
  deriveCefrFromOverall,
  flattenSkillBreakdown,
} from './score-authority.formulas';

describe('score-authority.formulas', () => {
  it('computes weighted overall on 0-100 scale', () => {
    const overall = computeOverall({
      fluency: 58,
      grammar: 83,
      pronunciation: 98,
      vocabulary: 0,
      comprehension: 67,
    });
    expect(overall).toBe(Math.round(58 * 0.25 + 83 * 0.22 + 98 * 0.22 + 0 + 67 * 0.13));
  });

  it('maps overall to CEFR thresholds from spec', () => {
    expect(deriveCefrFromOverall(35)).toBe('A1');
    expect(deriveCefrFromOverall(36)).toBe('A2');
    expect(deriveCefrFromOverall(56)).toBe('B1');
    expect(deriveCefrFromOverall(71)).toBe('B2');
  });

  it('goal progress uses next-level target', () => {
    const goal = computeGoalProgress(40, 'A1');
    expect(goal.label).toBe('Reach A2');
    expect(goal.targetScore).toBe(55);
    expect(goal.progressPercent).toBe(73);
  });

  it('flattens nested skill breakdown', () => {
    const pillars = flattenSkillBreakdown({
      pronunciation: { phonemeAccuracy: 98 },
      fluency: { speechRate: 58 },
      grammar: { tenseControl: 83 },
      vocabulary: { lexicalRange: 0 },
    });
    expect(pillars.pronunciation).toBe(98);
    expect(pillars.fluency).toBe(58);
    expect(pillars.grammar).toBe(83);
    expect(pillars.vocabulary).toBe(0);
  });

  it('assessment gating caps weak pronunciation', () => {
    const pillars = {
      pronunciation: 30,
      fluency: 80,
      grammar: 90,
      vocabulary: 70,
      comprehension: 70,
    };
    const raw = computeOverall(pillars);
    const gated = applyAssessmentGating(pillars, raw);
    expect(gated).toBeLessThanOrEqual(37);
    expect(clampScore(150)).toBe(100);
  });
});
