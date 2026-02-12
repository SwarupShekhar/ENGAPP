import { Controller, Post, Body, Get, Param, Patch, UseGuards, Req } from '@nestjs/common';
import { FriendshipService } from './friendship.service';

@Controller('friendship')
export class FriendshipController {
    constructor(private readonly friendshipService: FriendshipService) { }

    @Post('request')
    async sendRequest(@Body() body: { requesterId: string; addresseeClerkIdOrEmail: string }) {
        // We will use sendRequest logic which looks up user by Clerk ID (or email if we change implementation)
        // For now the service implements sendRequest taking (requesterId, addresseeClerkIdOrEmail)
        return this.friendshipService.sendRequest(body.requesterId, body.addresseeClerkIdOrEmail);
    }

    @Patch(':id/accept')
    async acceptRequest(@Param('id') id: string, @Body() body: { userId: string }) {
        return this.friendshipService.acceptRequest(body.userId, id);
    }

    @Patch(':id/reject')
    async rejectRequest(@Param('id') id: string, @Body() body: { userId: string }) {
        return this.friendshipService.rejectRequest(body.userId, id);
    }

    @Get(':userId/friends')
    async getFriends(@Param('userId') userId: string) {
        return this.friendshipService.getFriends(userId);
    }

    @Get(':userId/pending')
    async getPendingRequests(@Param('userId') userId: string) {
        return this.friendshipService.getPendingRequests(userId);
    }
}
