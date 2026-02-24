import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class WeaknessService {
  constructor(private prisma: PrismaService) {}

  /**
   * Retrieves the top 5 weak topic tags for a given user.
   * Weaknesses are determined by the UserTopicScore table.
   * Higher scores represent higher "weakness intensity" as per user requirements.
   */
  async getTopWeaknesses(userId: string): Promise<string[]> {
    const weaknesses = await this.prisma.userTopicScore.findMany({
      where: { userId },
      orderBy: {
        score: 'desc', // As specified: "ORDER BY score DESC LIMIT 5"
      },
      take: 5,
      select: {
        topicTag: true,
      },
    });

    return weaknesses.map((w) => w.topicTag);
  }
}
