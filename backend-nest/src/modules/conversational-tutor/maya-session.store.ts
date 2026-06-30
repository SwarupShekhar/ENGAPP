import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { MayaConversationSession } from './maya-session.types';

const REDIS_KEY_PREFIX = 'maya:session:';
const DEFAULT_TTL_SEC = 14_400; // 4 hours

interface SerializedMayaSession {
  history: {
    speaker: 'user' | 'ai';
    text: string;
    timestamp: string;
    corrections?: unknown[];
  }[];
  pronunciationAttempts: {
    referenceText: string;
    accuracy: number;
    passed: boolean;
    timestamp: string;
    problemWords: string[];
  }[];
}

@Injectable()
export class MayaSessionStore {
  private readonly logger = new Logger(MayaSessionStore.name);
  /** Process-local L1; Redis is source of truth across restarts. */
  private readonly l1 = new Map<string, MayaConversationSession>();

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  redisKey(sessionId: string): string {
    return `${REDIS_KEY_PREFIX}${sessionId}`;
  }

  private ttlSec(): number {
    const raw = this.config.get<string>('MAYA_SESSION_TTL_SEC');
    const parsed = raw != null ? Number(raw) : DEFAULT_TTL_SEC;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SEC;
  }

  async get(sessionId: string): Promise<MayaConversationSession | null> {
    const cached = this.l1.get(sessionId);
    if (cached) {
      return cached;
    }

    const raw = await this.redis.get(this.redisKey(sessionId));
    if (!raw) {
      return null;
    }

    try {
      const session = this.deserialize(raw);
      this.l1.set(sessionId, session);
      return session;
    } catch (err) {
      this.logger.warn(
        `Corrupt Maya session payload session=${sessionId}: ${(err as Error).message}`,
      );
      await this.redis.del(this.redisKey(sessionId));
      return null;
    }
  }

  async getOrCreate(sessionId: string): Promise<MayaConversationSession> {
    const existing = await this.get(sessionId);
    if (existing) {
      return existing;
    }

    const fresh: MayaConversationSession = {
      history: [],
      pronunciationAttempts: [],
    };
    this.l1.set(sessionId, fresh);
    await this.persist(sessionId, fresh);
    return fresh;
  }

  async persist(
    sessionId: string,
    session: MayaConversationSession,
  ): Promise<void> {
    this.l1.set(sessionId, session);
    await this.redis.set(
      this.redisKey(sessionId),
      this.serialize(session),
      this.ttlSec(),
    );
  }

  async delete(sessionId: string): Promise<void> {
    this.l1.delete(sessionId);
    await this.redis.del(this.redisKey(sessionId));
  }

  private serialize(session: MayaConversationSession): string {
    const payload: SerializedMayaSession = {
      history: session.history.map((h) => ({
        speaker: h.speaker,
        text: h.text,
        timestamp: h.timestamp.toISOString(),
        corrections: h.corrections,
      })),
      pronunciationAttempts: session.pronunciationAttempts.map((p) => ({
        referenceText: p.referenceText,
        accuracy: p.accuracy,
        passed: p.passed,
        timestamp: p.timestamp.toISOString(),
        problemWords: p.problemWords,
      })),
    };
    return JSON.stringify(payload);
  }

  private deserialize(raw: string): MayaConversationSession {
    const parsed = JSON.parse(raw) as SerializedMayaSession;
    return {
      history: (parsed.history ?? []).map((h) => ({
        speaker: h.speaker,
        text: h.text,
        timestamp: new Date(h.timestamp),
        corrections: h.corrections,
      })),
      pronunciationAttempts: (parsed.pronunciationAttempts ?? []).map((p) => ({
        referenceText: p.referenceText,
        accuracy: p.accuracy,
        passed: p.passed,
        timestamp: new Date(p.timestamp),
        problemWords: p.problemWords ?? [],
      })),
    };
  }
}
