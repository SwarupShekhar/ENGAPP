
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    console.log('Listing all users in DB:');
    const users = await prisma.user.findMany();
    users.forEach(u => console.log(`- ID: ${u.id}, ClerkID: ${u.clerkId}, Name: ${u.fname}`));

    console.log('\nChecking specifically for:');
    console.log('- Bot: user_bot_001');
    console.log('- Real User: user_39ZLFOelwNwh38OisfhMV2Yh29J (derived from logs)');

    const bot = await prisma.user.findUnique({ where: { id: 'user_bot_001' } });
    console.log(`Bot exists? ${!!bot}`);

    // The user ID in the logs might be a Clerk ID or a DB ID. Let's check both.
    const logUserId = 'user_39ZLFOelwNwh38OisfhMV2Yh29J';
    const userById = await prisma.user.findUnique({ where: { id: logUserId } });
    const userByClerkId = await prisma.user.findUnique({ where: { clerkId: logUserId } });

    console.log(`User with ID ${logUserId} exists? ${!!userById}`);
    console.log(`User with ClerkID ${logUserId} exists? ${!!userByClerkId}`);

    await prisma.$disconnect();
}

main().catch(console.error);
