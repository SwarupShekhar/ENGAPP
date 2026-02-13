import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient();
    try {
        const userCount = await prisma.user.count();
        const profileCount = await prisma.profile.count();
        console.log(`DATABASE_CHECK: users=${userCount}, profiles=${profileCount}`);

        if (userCount > 0) {
            const latestUser = await prisma.user.findFirst({
                orderBy: { createdAt: 'desc' }
            });
            console.log(`LATEST_USER: id=${latestUser.id}, clerkId=${latestUser.clerkId}, name=${latestUser.fname} ${latestUser.lname}`);
        }
    } catch (error) {
        console.error('DATABASE_CHECK_ERROR:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
