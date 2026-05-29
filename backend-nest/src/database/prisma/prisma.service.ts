import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, PoolConfig } from 'pg';

function buildPoolConfig(): PoolConfig {
  const max = Number(process.env.DATABASE_POOL_MAX ?? 15);
  const connectionString = process.env.DATABASE_URL;
  return {
    connectionString,
    max: Number.isFinite(max) && max > 0 ? max : 15,
    idleTimeoutMillis: Number(process.env.DATABASE_POOL_IDLE_MS ?? 30_000),
    connectionTimeoutMillis: Number(
      process.env.DATABASE_POOL_CONNECT_TIMEOUT_MS ?? 5_000,
    ),
    ssl: connectionString?.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  };
}

function prismaLogLevels(): Array<'query' | 'info' | 'warn' | 'error'> {
  if (process.env.PRISMA_LOG_QUERIES === 'true') {
    return ['query', 'info', 'warn', 'error'];
  }
  if (process.env.NODE_ENV === 'production') {
    return ['warn', 'error'];
  }
  return ['warn', 'error'];
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor() {
    const pool = new Pool(buildPoolConfig());

    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });

    const adapter = new PrismaPg(pool);
    super({
      adapter,
      log: prismaLogLevels(),
    });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    console.log('Prisma database connected successfully');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }

  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') return;

    const tablenames = await this.$queryRaw<
      Array<{ tablename: string }>
    >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

    const tables = tablenames
      .map(({ tablename }) => tablename)
      .filter((name) => name !== '_prisma_migrations')
      .map((name) => `"public"."${name}"`)
      .join(', ');

    try {
      await this.$executeRawUnsafe(
        `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE;`,
      );
    } catch (error) {
      console.log({ error });
    }
  }
}
