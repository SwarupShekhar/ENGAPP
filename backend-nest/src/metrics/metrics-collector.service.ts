import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Queue } from 'bull';
import { ChatGateway } from '../modules/chat/chat.gateway';
import { RealtimeAudioGateway } from '../modules/livekit/realtime-audio.gateway';
import { RedisService } from '../redis/redis.service';
import {
  SESSIONS_MAYA_QUEUE,
  SESSIONS_P2P_QUEUE,
} from '../queues/sessions-queue.constants';
import {
  bullQueueActive,
  bullQueueWaiting,
  redisConnected,
  socketConnectionsActive,
} from './prometheus';

const COLLECT_INTERVAL_MS = 15_000;

@Injectable()
export class MetricsCollectorService implements OnModuleInit {
  private readonly logger = new Logger(MetricsCollectorService.name);

  constructor(
    @InjectQueue(SESSIONS_P2P_QUEUE) private readonly p2pQueue: Queue,
    @InjectQueue(SESSIONS_MAYA_QUEUE) private readonly mayaQueue: Queue,
    private readonly redisService: RedisService,
    @Optional() private readonly chatGateway?: ChatGateway,
    @Optional() private readonly audioGateway?: RealtimeAudioGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.collect();
  }

  @Interval(COLLECT_INTERVAL_MS)
  async collect(): Promise<void> {
    await Promise.all([
      this.collectBullQueues(),
      this.collectRedis(),
      this.collectSocketConnections(),
    ]);
  }

  private async collectBullQueues(): Promise<void> {
    await Promise.all([
      this.updateQueueMetrics(this.p2pQueue, SESSIONS_P2P_QUEUE),
      this.updateQueueMetrics(this.mayaQueue, SESSIONS_MAYA_QUEUE),
    ]);
  }

  private async updateQueueMetrics(queue: Queue, name: string): Promise<void> {
    try {
      const counts = await queue.getJobCounts();
      bullQueueWaiting.set({ queue: name }, counts.waiting ?? 0);
      bullQueueActive.set({ queue: name }, counts.active ?? 0);
    } catch (error) {
      this.logger.warn(
        `Failed to collect Bull metrics for ${name}: ${error instanceof Error ? error.message : error}`,
      );
      bullQueueWaiting.set({ queue: name }, 0);
      bullQueueActive.set({ queue: name }, 0);
    }
  }

  private async collectRedis(): Promise<void> {
    try {
      const client = this.redisService.getClient();
      const pong = await client.ping();
      redisConnected.set(pong === 'PONG' ? 1 : 0);
    } catch (error) {
      this.logger.warn(
        `Redis health check failed: ${error instanceof Error ? error.message : error}`,
      );
      redisConnected.set(0);
    }
  }

  private collectSocketConnections(): void {
    const chatCount = this.chatGateway?.getActiveConnectionCount() ?? 0;
    const audioCount = this.audioGateway?.getActiveConnectionCount() ?? 0;
    socketConnectionsActive.set(chatCount + audioCount);
  }
}
