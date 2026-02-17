import { Controller, Post, Body, Get, Param, Patch, Delete, UseGuards, Request } from '@nestjs/common';
import { ClerkGuard } from '../auth/clerk.guard';
import { FriendshipService } from './friendship.service';

@Controller('friendship')
@UseGuards(ClerkGuard)
export class FriendshipController {
    constructor(private readonly friendshipService: FriendshipService) {}

    /**
     * Send a friend request to another user by their internal userId.
     * POST /friendship/request
     * Body: { targetUserId: string }
     */
    @Post('request')
    async sendRequest(
        @Request() req,
        @Body('targetUserId') targetUserId: string,
    ) {
        return this.friendshipService.sendRequestById(req.user.id, targetUserId);
    }

    /**
     * Accept a pending friend request.
     * PATCH /friendship/:id/accept
     */
    @Patch(':id/accept')
    async acceptRequest(
        @Request() req,
        @Param('id') id: string,
    ) {
        return this.friendshipService.acceptRequest(req.user.id, id);
    }

    /**
     * Reject a pending friend request.
     * PATCH /friendship/:id/reject
     */
    @Patch(':id/reject')
    async rejectRequest(
        @Request() req,
        @Param('id') id: string,
    ) {
        return this.friendshipService.rejectRequest(req.user.id, id);
    }

    /**
     * Get connection status with a specific user.
     * GET /friendship/status/:targetUserId
     * Returns: { status, requestId?, conversationId? }
     */
    @Get('status/:targetUserId')
    async getStatus(
        @Request() req,
        @Param('targetUserId') targetUserId: string,
    ) {
        return this.friendshipService.getConnectionStatus(req.user.id, targetUserId);
    }

    /**
     * Get all current friends.
     * GET /friendship/friends
     */
    @Get('friends')
    async getFriends(@Request() req) {
        return this.friendshipService.getFriends(req.user.id);
    }

    /**
     * Get pending incoming friend requests.
     * GET /friendship/pending
     */
    @Get('pending')
    async getPendingRequests(@Request() req) {
        return this.friendshipService.getPendingRequests(req.user.id);
    }
}
