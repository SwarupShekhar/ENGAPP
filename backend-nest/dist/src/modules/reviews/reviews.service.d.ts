import { PrismaService } from '../../database/prisma/prisma.service';
export declare class ReviewsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    submitReview(data: {
        sessionId: string;
        reviewerId: string;
        revieweeId: string;
        rating: number;
        comment?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        sessionId: string;
        rating: number;
        comment: string | null;
        reviewerId: string;
        revieweeId: string;
    }>;
    getReviewsReceived(userId: string): Promise<({
        reviewer: {
            fname: string;
            lname: string;
        };
    } & {
        id: string;
        createdAt: Date;
        sessionId: string;
        rating: number;
        comment: string | null;
        reviewerId: string;
        revieweeId: string;
    })[]>;
    blockUser(blockerId: string, blockedUserId: string): Promise<{
        id: string;
        createdAt: Date;
        blockerId: string;
        blockedUserId: string;
    }>;
    getBlockedUsers(userId: string): Promise<({
        blockedUser: {
            id: string;
            fname: string;
            lname: string;
        };
    } & {
        id: string;
        createdAt: Date;
        blockerId: string;
        blockedUserId: string;
    })[]>;
}
