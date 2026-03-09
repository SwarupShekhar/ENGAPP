import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      take: 5,
      select: { id: true, clerkId: true },
    });
    console.log('--- DB Check ---');
    console.log('Users found:', users.length);
    if (users.length > 0) {
      const u = users[0];
      console.log('User 0:', u.id, u.clerkId);

      const assessmentCount = await prisma.assessmentSession.count({
        where: { userId: u.id },
      });
      const speechCount = await prisma.conversationSession.count({
        where: { participants: { some: { userId: u.id } } },
      });
      console.log(
        `User ${u.id}: ${assessmentCount} assessments, ${speechCount} conversations`,
      );
    } else {
      console.log('No users found in database.');
    }
  } catch (e) {
    console.error('Prisma connection failed:', e.message);
    if (e.code) console.log('Prisma Error Code:', e.code);
  } finally {
    await prisma.$disconnect();
  }
}

main();
