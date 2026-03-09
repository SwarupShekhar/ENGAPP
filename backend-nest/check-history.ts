import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkHistory(userId: string) {
  const prisma = new PrismaClient();
  try {
    const history = await prisma.userReelHistory.findMany({
      where: { userId },
    });
    console.log(`History for ${userId}:`, history.length, 'reels');
    history.forEach((h) =>
      console.log(` - Reel ${h.strapiReelId}: completed=${h.completed}`),
    );
  } catch (e) {
    console.error('History Check Failed:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

const userId = '452e1508-dd1d-4fd6-8ffa-f0e9f9e6ebb7';
checkHistory(userId);
