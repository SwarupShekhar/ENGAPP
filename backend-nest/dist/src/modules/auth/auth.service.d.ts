import { PrismaService } from '../../database/prisma/prisma.service';
import { ClerkService } from '../../integrations/clerk.service';
export declare class AuthService {
    private prisma;
    private clerkService;
    private readonly logger;
    constructor(prisma: PrismaService, clerkService: ClerkService);
    validateUser(clerkId: string): Promise<{
        profile: {
            id: string;
            userId: string;
            bio: string | null;
            avatarUrl: string | null;
            streak: number;
            totalSessions: number;
        };
    } & {
        level: string;
        id: string;
        clerkId: string;
        fname: string;
        lname: string;
        gender: string | null;
        hobbies: string[];
        nativeLang: string;
        overallLevel: string | null;
        talkStyle: import(".prisma/client").$Enums.TalkStyle | null;
        levelUpdatedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getUserProfile(userId: string): Promise<{
        profile: {
            id: string;
            userId: string;
            bio: string | null;
            avatarUrl: string | null;
            streak: number;
            totalSessions: number;
        };
    } & {
        level: string;
        id: string;
        clerkId: string;
        fname: string;
        lname: string;
        gender: string | null;
        hobbies: string[];
        nativeLang: string;
        overallLevel: string | null;
        talkStyle: import(".prisma/client").$Enums.TalkStyle | null;
        levelUpdatedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    createUser(userData: {
        clerkId: string;
        fname: string;
        lname: string;
        gender?: string;
        hobbies?: string[];
        nativeLang: string;
        level: string;
    }): Promise<{
        profile: {
            id: string;
            userId: string;
            bio: string | null;
            avatarUrl: string | null;
            streak: number;
            totalSessions: number;
        };
    } & {
        level: string;
        id: string;
        clerkId: string;
        fname: string;
        lname: string;
        gender: string | null;
        hobbies: string[];
        nativeLang: string;
        overallLevel: string | null;
        talkStyle: import(".prisma/client").$Enums.TalkStyle | null;
        levelUpdatedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
