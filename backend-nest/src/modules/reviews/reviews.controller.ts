import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ClerkGuard } from '../auth/clerk.guard';

@Controller('reviews')
@UseGuards(ClerkGuard)
export class ReviewsController {
    constructor(private readonly reviewsService: ReviewsService) { }

    @Post()
    async submitReview(
        @Request() req: any,
        @Body() data: { sessionId: string; revieweeId: string; rating: number; comment?: string }
    ) {
        return this.reviewsService.submitReview({
            ...data,
            reviewerId: req.user.id,
        });
    }

    @Get('me')
    async getMyReviews(@Request() req: any) {
        return this.reviewsService.getReviewsReceived(req.user.id);
    }

    @Post('block')
    async blockUser(
        @Request() req: any,
        @Body() data: { blockedUserId: string }
    ) {
        return this.reviewsService.blockUser(req.user.id, data.blockedUserId);
    }

    @Get('blocks')
    async getMyBlocks(@Request() req: any) {
        return this.reviewsService.getBlockedUsers(req.user.id);
    }
}
