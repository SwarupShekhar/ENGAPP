import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findFirst({
    where: { fname: { not: '' } },
    orderBy: { lastSessionAt: 'desc' },
    select: { id: true, fname: true },
  });
  if (!user) {
    console.log('No user found');
    return;
  }
  console.log('User:', user.id, user.fname);

  const assessment = await prisma.assessmentSession.findFirst({
    where: { userId: user.id, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
  });
  console.log('Latest Assessment ID:', assessment?.id);
  console.log(
    'Latest Assessment Breakdown:',
    JSON.stringify(assessment?.skillBreakdown, null, 2),
  );

  const analysis = await prisma.analysis.findFirst({
    where: { participant: { userId: user.id } },
    orderBy: { createdAt: 'desc' },
  });
  console.log('Latest Analysis ID:', analysis?.id);
  console.log(
    'Latest Analysis Scores:',
    JSON.stringify(analysis?.scores, null, 2),
  );
}
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
