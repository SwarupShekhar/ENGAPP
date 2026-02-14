"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const dotenv = require("dotenv");
dotenv.config();
async function main() {
    const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new adapter_pg_1.PrismaPg(pool);
    const prisma = new client_1.PrismaClient({ adapter });
    console.log('Listing all users in DB:');
    const users = await prisma.user.findMany();
    users.forEach(u => console.log(`- ID: ${u.id}, ClerkID: ${u.clerkId}, Name: ${u.fname}`));
    console.log('\nChecking specifically for:');
    console.log('- Bot: user_bot_001');
    console.log('- Real User: user_39ZLFOelwNwh38OisfhMV2Yh29J (derived from logs)');
    const bot = await prisma.user.findUnique({ where: { id: 'user_bot_001' } });
    console.log(`Bot exists? ${!!bot}`);
    const logUserId = 'user_39ZLFOelwNwh38OisfhMV2Yh29J';
    const userById = await prisma.user.findUnique({ where: { id: logUserId } });
    const userByClerkId = await prisma.user.findUnique({ where: { clerkId: logUserId } });
    console.log(`User with ID ${logUserId} exists? ${!!userById}`);
    console.log(`User with ClerkID ${logUserId} exists? ${!!userByClerkId}`);
    await prisma.$disconnect();
}
main().catch(console.error);
//# sourceMappingURL=list-users.js.map