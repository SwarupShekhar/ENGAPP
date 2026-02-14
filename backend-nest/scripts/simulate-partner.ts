
import { RedisService } from '../src/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import Redis from 'ioredis';

dotenv.config();

async function simulatePartner() {
    const configService = new ConfigService();
    // Start Redis manually for script
    const client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        username: process.env.REDIS_USERNAME || 'default',
        password: process.env.REDIS_PASSWORD,
    });

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    const botUserId = 'user_bot_001';
    const level = 'B1';
    const topic = 'general';

    console.log(`Bot joining queue: ${botUserId} (Level: ${level}, Topic: ${topic})`);

    // Ensure bot is in database
    await prisma.user.upsert({
        where: { id: botUserId },
        update: {},
        create: {
            id: botUserId,
            clerkId: 'clerk_bot_001',
            fname: 'EngR',
            lname: 'Bot',
            nativeLang: 'BotLang',
            level: 'expert'
        }
    });

    const queueKey = `queue:${level}`;
    const timestamp = Date.now();

    await client.hset(`user:${botUserId}:meta`, {
        joinedAt: timestamp.toString(),
        level,
        topic,
    });

    await client.rpush(queueKey, botUserId);

    console.log('Bot is in queue. Now wait for your device to join the same level (B1).');
    console.log('Matchmaking will happen automatically in the backend.');

    // Keep script alive to allow matching
    setTimeout(async () => {
        await client.quit();
        await prisma.$disconnect();
        process.exit(0);
    }, 60000);
}

simulatePartner().catch(console.error);
