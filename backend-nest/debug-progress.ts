import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

// Direct port of the ProgressService logic for debugging
async function debugProgress(userId: string) {
  const prisma = new PrismaClient();
  try {
    console.log(`Starting debug for user: ${userId}`);

    const [lastAssessment, lastConversation] = await Promise.all([
      prisma.assessmentSession.findFirst({
        where: { userId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
      }),
      prisma.conversationSession.findFirst({
        where: {
          participants: { some: { userId } },
          status: 'COMPLETED',
          summaryJson: { not: null },
        },
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    console.log('Last Assessment:', lastAssessment?.id);
    console.log('Last Conversation:', lastConversation?.id);

    if (!lastAssessment && !lastConversation) {
      console.log('No sessions found returning empty.');
      return;
    }

    const currentIsAssessment =
      !lastConversation ||
      (lastAssessment &&
        lastAssessment.completedAt &&
        lastAssessment.completedAt > (lastConversation.startedAt || 0));

    const currentSession = currentIsAssessment
      ? lastAssessment
      : lastConversation;
    console.log(
      'Current Session type:',
      currentIsAssessment ? 'Assessment' : 'Conversation',
    );

    // Previous session logic
    // ... skipping complex LT/GT logic for check, just seeing if it fails up to here ...

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    console.log('Querying weekly activity...');
    const sessions = await prisma.sessionParticipant.findMany({
      where: {
        userId,
        session: {
          startedAt: { gte: sevenDaysAgo },
          status: 'COMPLETED',
        },
      },
      include: {
        session: true,
      },
    });
    console.log('Sessions found for activity:', sessions.length);
  } catch (e) {
    console.error('DEBUG ERROR:', e);
  } finally {
    await prisma.$disconnect();
  }
}

// Get the user ID from the logs provided by the user
const userId = '452e1508-dd1d-4fd6-8ffa-f0e9f9e6ebb7';
debugProgress(userId);
