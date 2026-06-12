import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';

@Injectable()
export class CommunityBuilder {
  constructor(private prisma: PrismaService) {}

  async buildCommunityData(userId: string): Promise<{ onlineCount: number; avatars: string[] }> {
    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

      const recentParticipants = await this.prisma.sessionParticipant.findMany({
        where: {
          userId: { not: userId },
          lastHeartbeat: { gte: fifteenMinutesAgo },
        },
        select: {
          userId: true,
          user: {
            select: {
              fname: true,
              lname: true,
            },
          },
        },
        distinct: ['userId'],
      });

      const onlineCount = recentParticipants.length;

      const avatars = recentParticipants
        .slice(0, 4)
        .map((p) => {
          const first = (p.user.fname || '').trim().charAt(0).toUpperCase();
          const last = (p.user.lname || '').trim().charAt(0).toUpperCase();
          return (first + last).slice(0, 2) || '??';
        })
        .filter((initials) => initials.length > 0);

      return { onlineCount, avatars };
    } catch {
      return { onlineCount: 0, avatars: [] };
    }
  }
}
