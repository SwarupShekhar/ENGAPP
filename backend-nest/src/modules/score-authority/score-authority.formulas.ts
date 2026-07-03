export type PillarScores = {
  pronunciation: number;
  fluency: number;
  grammar: number;
  vocabulary: number;
  comprehension: number;
};

export const PILLAR_WEIGHTS = {
  fluency: 0.25,
  grammar: 0.22,
  pronunciation: 0.22,
  vocabulary: 0.18,
  comprehension: 0.13,
} as const;

export const GOAL_TARGETS: Record<string, number> = {
  A1: 35,
  A2: 55,
  B1: 70,
  B2: 80,
  C1: 90,
  C2: 97,
};

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export function clampScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, Number(value) || 0)));
}

export function computeOverall(pillars: PillarScores): number {
  const p = {
    pronunciation: clampScore(pillars.pronunciation),
    fluency: clampScore(pillars.fluency),
    grammar: clampScore(pillars.grammar),
    vocabulary: clampScore(pillars.vocabulary),
    comprehension: clampScore(pillars.comprehension),
  };
  return Math.round(
    p.fluency * PILLAR_WEIGHTS.fluency +
      p.grammar * PILLAR_WEIGHTS.grammar +
      p.pronunciation * PILLAR_WEIGHTS.pronunciation +
      p.vocabulary * PILLAR_WEIGHTS.vocabulary +
      p.comprehension * PILLAR_WEIGHTS.comprehension,
  );
}

/** Spec §4.2 — canonical CEFR thresholds */
export function deriveCefrFromOverall(overall: number): string {
  const score = clampScore(overall);
  if (score <= 35) return 'A1';
  if (score <= 55) return 'A2';
  if (score <= 70) return 'B1';
  if (score <= 80) return 'B2';
  if (score <= 90) return 'C1';
  return 'C2';
}

export function getNextCefrLevel(current: string): string {
  const normalized = (current || 'A1').toUpperCase();
  const idx = CEFR_ORDER.indexOf(normalized as (typeof CEFR_ORDER)[number]);
  if (idx < 0 || idx >= CEFR_ORDER.length - 1) return 'C2';
  return CEFR_ORDER[idx + 1];
}

export function computeGoalProgress(overall: number, cefrLevel: string) {
  const next = getNextCefrLevel(cefrLevel);
  const target = GOAL_TARGETS[next] ?? 100;
  const progressPercent =
    target > 0 ? Math.min(Math.round((clampScore(overall) / target) * 100), 99) : 0;
  return {
    label: `Reach ${next}`,
    targetScore: target,
    progressPercent,
  };
}

export function applyPronunciationGating(
  pronunciationScore: number,
  overallScore: number,
): number {
  if (pronunciationScore < 35) return Math.min(overallScore, 37);
  if (pronunciationScore < 45) return Math.min(overallScore, 54);
  if (pronunciationScore < 55) return Math.min(overallScore, 71);
  if (pronunciationScore < 70) return Math.min(overallScore, 89);
  return overallScore;
}

export function applyFluencyGating(
  fluencyScore: number,
  overallScore: number,
): number {
  if (fluencyScore < 30) return Math.min(overallScore, 37);
  if (fluencyScore < 40) return Math.min(overallScore, 54);
  if (fluencyScore < 50) return Math.min(overallScore, 71);
  if (fluencyScore < 65) return Math.min(overallScore, 81);
  return overallScore;
}

export function applyMultiFactorGating(
  scores: PillarScores,
  overallScore: number,
): number {
  let cappedScore = overallScore;

  if (scores.pronunciation < 45 && scores.fluency < 45) {
    cappedScore = Math.min(cappedScore, 44);
  }
  if (scores.grammar < 35) {
    cappedScore = Math.min(cappedScore, 44);
  }

  const weakComponents = [
    scores.pronunciation,
    scores.fluency,
    scores.grammar,
    scores.vocabulary,
    scores.comprehension,
  ].filter((score) => score < 50).length;

  if (weakComponents >= 3) {
    cappedScore = Math.min(cappedScore, 60);
  }
  if (
    scores.pronunciation < 60 &&
    scores.fluency < 60 &&
    scores.grammar < 60
  ) {
    cappedScore = Math.min(cappedScore, 71);
  }

  return cappedScore;
}

export function applyAssessmentGating(
  pillars: PillarScores,
  overallScore: number,
): number {
  let score = overallScore;
  score = applyPronunciationGating(pillars.pronunciation, score);
  score = applyFluencyGating(pillars.fluency, score);
  score = applyMultiFactorGating(pillars, score);
  return Math.round(score);
}

export function flattenSkillBreakdown(breakdown: unknown): PillarScores {
  if (!breakdown || typeof breakdown !== 'object') {
    return {
      pronunciation: 0,
      fluency: 0,
      grammar: 0,
      vocabulary: 0,
      comprehension: 0,
    };
  }

  const b = breakdown as Record<string, unknown>;
  const getScore = (val: unknown): number => {
    if (typeof val === 'number') return val;
    if (val && typeof val === 'object') {
      const o = val as Record<string, number>;
      return (
        o.phonemeAccuracy ||
        o.speechRate ||
        o.tenseControl ||
        o.lexicalRange ||
        o.score ||
        0
      );
    }
    return 0;
  };

  return {
    pronunciation: clampScore(getScore(b.pronunciation)),
    fluency: clampScore(getScore(b.fluency)),
    grammar: clampScore(getScore(b.grammar)),
    vocabulary: clampScore(getScore(b.vocabulary)),
    comprehension: clampScore(
      getScore(b.comprehension) || Number((b as { overallScore?: number }).overallScore) || 0,
    ),
  };
}
