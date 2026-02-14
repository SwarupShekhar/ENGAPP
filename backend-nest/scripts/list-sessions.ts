
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Fetching all sessions...');
    const sessions = await prisma.conversationSession.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { participants: true } } }
    });

    console.log(`Found ${sessions.length} recent sessions:`);
    sessions.forEach(s => {
        console.log(`- ID: ${s.id}, Status: ${s.status}, Created: ${s.createdAt}, Participants: ${s._count.participants}`);
    });

    const targetId = '0f63bbc8-1c36-4e6b-9d54-9aa263f06790';
    const specific = await prisma.conversationSession.findUnique({
        where: { id: targetId }
    });
    console.log(`\nSpecific session ${targetId} exists? ${!!specific}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
