import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { ClerkGuard } from '../auth/clerk.guard';

@Controller('feedback')
export class FeedbackController {
    constructor(private feedbackService: FeedbackService) { }

    @UseGuards(ClerkGuard)
    @Get(':sessionId')
    async getFeedback(@Param('sessionId') sessionId: string, @Request() req) {
        // req.user.id is the internal user id set by the ClerkGuard/AuthService
        return this.feedbackService.getFeedback(sessionId, req.user.id);
    }
}
