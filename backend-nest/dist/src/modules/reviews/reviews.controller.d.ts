import { ReviewsService } from './reviews.service';
export declare class ReviewsController {
    private readonly reviewsService;
    constructor(reviewsService: ReviewsService);
    submitReview(req: any, data: {
        sessionId: string;
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
    getMyReviews(req: any): Promise<({
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
    blockUser(req: any, data: {
        blockedUserId: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        blockerId: string;
        blockedUserId: string;
    }>;
    getMyBlocks(req: any): Promise<({
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
