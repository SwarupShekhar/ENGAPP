"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@nestjs/config");
const dotenv = require("dotenv");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const ioredis_1 = require("ioredis");
dotenv.config();
async function simulatePartner() {
    const configService = new config_1.ConfigService();
    const client = new ioredis_1.default({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        username: process.env.REDIS_USERNAME || 'default',
        password: process.env.REDIS_PASSWORD,
    });
    const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new adapter_pg_1.PrismaPg(pool);
    const prisma = new client_1.PrismaClient({ adapter });
    const botUserId = 'user_bot_001';
    const level = 'B1';
    const topic = 'general';
    console.log(`Bot joining queue: ${botUserId} (Level: ${level}, Topic: ${topic})`);
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
    setTimeout(async () => {
        await client.quit();
        await prisma.$disconnect();
        process.exit(0);
    }, 60000);
}
simulatePartner().catch(console.error);
//# sourceMappingURL=simulate-partner.js.map