/**
 * Production backfill — uses compiled dist formulas + Prisma pg adapter (Prisma 7).
 *
 *   node scripts/backfill-score-profiles.cjs
 */
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const {
  applyAssessmentGating,
  clampScore,
  computeOverall,
  deriveCefrFromOverall,
  flattenSkillBreakdown,
} = require('../dist/modules/score-authority/score-authority.formulas');

function createPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Run inside the backend-nest container or export DATABASE_URL.',
    );
  }
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    ssl: connectionString.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return { prisma, pool };
}

async function upsertProfile(
  prisma,
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
  const { prisma, pool } = createPrisma();
  try {
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
        prisma,
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
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
