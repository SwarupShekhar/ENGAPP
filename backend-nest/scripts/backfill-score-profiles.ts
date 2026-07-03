/**
 * Backfill UserScoreProfile from each user's latest completed assessment.
 *
 * Usage (from backend-nest/):
 *   SCORES_AUTHORITY_V1=true npx ts-node -r tsconfig-paths/register scripts/backfill-score-profiles.ts
 */
import { PrismaClient } from '@prisma/client';
import {
  applyAssessmentGating,
  clampScore,
  computeOverall,
  deriveCefrFromOverall,
  flattenSkillBreakdown,
} from '../src/modules/score-authority/score-authority.formulas';

const prisma = new PrismaClient();

async function upsertProfile(
  userId: string,
  assessmentId: string,
  skillBreakdown: unknown,
  phase3Data: unknown,
  phase4Data: unknown,
) {
  const pillars = flattenSkillBreakdown(skillBreakdown);
  const p3 = (phase3Data as { vocabularyCEFR?: string } | null) ?? {};
  const p4 = (phase4Data as { comprehensionScore?: number } | null) ?? {};
  if (typeof p4.comprehensionScore === 'number') {
    pillars.comprehension = clampScore(p4.comprehensionScore);
  }
  const vocabularyMeasured = pillars.vocabulary > 0 || Boolean(p3.vocabularyCEFR);
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
    await upsertProfile(s.userId, s.id, s.skillBreakdown, s.phase3Data, s.phase4Data);
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
