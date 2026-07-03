/**
 * Production backfill — uses compiled dist formulas (works inside Docker image).
 *
 *   node scripts/backfill-score-profiles.cjs
 */
const { PrismaClient } = require('@prisma/client');
const {
  applyAssessmentGating,
  clampScore,
  computeOverall,
  deriveCefrFromOverall,
  flattenSkillBreakdown,
} = require('../dist/modules/score-authority/score-authority.formulas');

const prisma = new PrismaClient();

async function upsertProfile(
  userId,
  assessmentId,
  skillBreakdown,
  phase3Data,
  phase4Data,
) {
  const pillars = flattenSkillBreakdown(skillBreakdown);
  const p3 = phase3Data ?? {};
  const p4 = phase4Data ?? {};
  if (typeof p4.comprehensionScore === 'number') {
    pillars.comprehension = clampScore(p4.comprehensionScore);
  }
  const vocabularyMeasured =
    pillars.vocabulary > 0 || Boolean(p3.vocabularyCEFR);

  let overall = computeOverall(pillars);
  overall = applyAssessmentGating(pillars, overall);
  const cefrLevel = deriveCefrFromOverall(overall);

  await prisma.userScoreProfile.upsert({
    where: { userId },
    create: {
      userId,
      overallScore: overall,
      cefrLevel,
      pronunciation: pillars.pronunciation,
      fluency: pillars.fluency,
      grammar: pillars.grammar,
      vocabulary: pillars.vocabulary,
      comprehension: pillars.comprehension,
      vocabularyMeasured,
      baselineAssessmentId: assessmentId,
      lastEventType: 'backfill',
    },
    update: {
      overallScore: overall,
      cefrLevel,
      pronunciation: pillars.pronunciation,
      fluency: pillars.fluency,
      grammar: pillars.grammar,
      vocabulary: pillars.vocabulary,
      comprehension: pillars.comprehension,
      vocabularyMeasured,
      baselineAssessmentId: assessmentId,
      lastEventType: 'backfill',
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      assessmentScore: overall,
      overallLevel: cefrLevel,
      levelUpdatedAt: new Date(),
    },
  });

  for (const [pillar, score] of Object.entries(pillars)) {
    await prisma.userTopicScore.upsert({
      where: { userId_topicTag: { userId, topicTag: `pillar_${pillar}` } },
      create: { userId, topicTag: `pillar_${pillar}`, score },
      update: { score },
    });
  }

  await prisma.scoreChangeLog.create({
    data: {
      userId,
      eventType: 'backfill',
      assessmentId,
      after: { overall, cefrLevel, pillars },
    },
  });
}

async function main() {
  const sessions = await prisma.assessmentSession.findMany({
    where: { status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    distinct: ['userId'],
    select: {
      id: true,
      userId: true,
      skillBreakdown: true,
      phase3Data: true,
      phase4Data: true,
    },
  });

  let ok = 0;
  for (const s of sessions) {
    await upsertProfile(
      s.userId,
      s.id,
      s.skillBreakdown,
      s.phase3Data,
      s.phase4Data,
    );
    ok += 1;
    console.log(`backfilled user=${s.userId} assessment=${s.id}`);
  }
  console.log(`Done. ${ok} profiles.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
