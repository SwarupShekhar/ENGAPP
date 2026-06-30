import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { MayaSessionStore } from './maya-session.store';

const DEFAULT_ORPHAN_GRACE_SEC = 14_400; // 4 hours — align with Redis session TTL

@Injectable()
export class MayaSessionCleanupService {
  private readonly logger = new Logger(MayaSessionCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly sessionStore: MayaSessionStore,
  ) {}

  private orphanGraceMs(): number {
    const raw = this.config.get<string>('MAYA_ORPHAN_GRACE_SEC');
    const parsed = raw != null ? Number(raw) : DEFAULT_ORPHAN_GRACE_SEC;
    const sec =
      Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ORPHAN_GRACE_SEC;
    return sec * 1000;
  }

  /** Mark stale IN_PROGRESS Maya DB rows ABANDONED and purge Redis keys. */
  @Cron(CronExpression.EVERY_HOUR)
  async sweepOrphanedMayaSessions(): Promise<void> {
    const cutoff = new Date(Date.now() - this.orphanGraceMs());

    const stale = await this.prisma.conversationSession.findMany({
      where: {
        structure: 'ai_tutor',
        status: 'IN_PROGRESS',
        participants: {
          every: { lastHeartbeat: { lt: cutoff } },
        },
      },
      select: { id: true },
      take: 200,
    });

    if (stale.length === 0) {
      return;
    }

    const ids = stale.map((s) => s.id);

    const updated = await this.prisma.conversationSession.updateMany({
      where: { id: { in: ids }, status: 'IN_PROGRESS' },
      data: { status: 'ABANDONED', endedAt: new Date() },
    });

    await Promise.all(
      ids.flatMap((id) => [
        this.sessionStore.delete(id),
        this.redis.del(`maya:turns:${id}`),
      ]),
    );

    this.logger.log(
      `Maya orphan sweep: marked ${updated.count} session(s) ABANDONED (heartbeat before ${cutoff.toISOString()})`,
    );
  }
}
