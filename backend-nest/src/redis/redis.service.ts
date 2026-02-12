import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor(private configService: ConfigService) { }

  async onModuleInit() {
    this.client = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      username: this.configService.get('REDIS_USERNAME', 'default'),
      password: this.configService.get('REDIS_PASSWORD'),
      db: 0,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.client.on('error', (error) => {
      console.error('Redis connection error:', error);
    });

    this.client.on('connect', () => {
      console.log('Redis connected successfully');
    });

    // Test connection
    try {
      await this.client.ping();
      console.log('Redis connection verified');
    } catch (error) {
      console.error('Redis connection failed:', error);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  getClient(): Redis {
    return this.client;
  }

  // Common Redis operations
  async set(key: string, value: string, expireInSeconds?: number): Promise<void> {
    if (expireInSeconds) {
      await this.client.setex(key, expireInSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  async exists(key: string): Promise<number> {
    return await this.client.exists(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return await this.client.expire(key, seconds);
  }

  // Hash operations
  async hset(key: string, field: string, value: string): Promise<number> {
    return await this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return await this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return await this.client.hgetall(key);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return await this.client.hdel(key, ...fields);
  }

  // List operations
  async lpush(key: string, ...values: string[]): Promise<number> {
    return await this.client.lpush(key, ...values);
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    return await this.client.rpush(key, ...values);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.client.lrange(key, start, stop);
  }

  async llen(key: string): Promise<number> {
    return await this.client.llen(key);
  }

  // Set operations
  async sadd(key: string, ...members: string[]): Promise<number> {
    return await this.client.sadd(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return await this.client.smembers(key);
  }

  async sismember(key: string, member: string): Promise<number> {
    return await this.client.sismember(key, member);
  }

  // Sorted set operations
  async zadd(key: string, score: number, member: string): Promise<number> {
    return await this.client.zadd(key, score, member);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.client.zrange(key, start, stop);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.client.zrevrange(key, start, stop);
  }

  async zcard(key: string): Promise<number> {
    return await this.client.zcard(key);
  }
}