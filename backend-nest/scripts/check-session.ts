
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const sessionId = '0f63bbc8-1c36-4e6b-9d54-9aa263f06790';
    const session = await prisma.conversationSession.findUnique({
        where: { id: sessionId },
        include: { participants: true }
    });

    if (session) {
        console.log('Session found:', JSON.stringify(session, null, 2));
    } else {
        console.log('Session NOT found in database.');

        const count = await prisma.conversationSession.count();
        console.log('Total sessions in DB:', count);

        const lastSession = await prisma.conversationSession.findFirst({
            orderBy: { createdAt: 'desc' }
        });
        console.log('Last session created:', JSON.stringify(lastSession, null, 2));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
