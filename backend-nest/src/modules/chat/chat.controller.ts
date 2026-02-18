import {
    Controller, Get, Post, Param, Query,
    Request, UseGuards, Body,
} from '@nestjs/common';
import { ClerkGuard } from '../auth/clerk.guard';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(ClerkGuard)
export class ChatController {
    constructor(private readonly chatService: ChatService) {}

    @Get('conversations')
    getConversations(@Request() req) {
        return this.chatService.getUserConversations(req.user.id);
    }

    @Post('find-or-create')
    async findOrCreate(@Request() req, @Body('targetUserId') targetUserId: string) {
        const conversationId = await this.chatService.getOrCreateConversation(req.user.id, targetUserId);
        return { conversationId };
    }

    @Get('conversations/:conversationId/messages')
    getMessages(
        @Request() req,
        @Param('conversationId') conversationId: string,
        @Query('limit') limit?: string,
        @Query('before') before?: string,
    ) {
        return this.chatService.getMessages(
            conversationId,
            req.user.id,
            limit ? parseInt(limit) : 30,
            before,
        );
    }

    @Get('unread-count')
    async getUnreadCount(@Request() req) {
        const count = await this.chatService.getUnreadCount(req.user.id);
        return { count };
    }

    @Post('conversations/:conversationId/read')
    markAsRead(
        @Request() req,
        @Param('conversationId') conversationId: string,
    ) {
        return this.chatService.markAsRead(conversationId, req.user.id);
    }
}
