import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Request,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ClerkGuard } from '../auth/clerk.guard';
import { EngagementService } from './engagement.service';

@Controller('engagement')
@UseGuards(ClerkGuard)
export class EngagementController {
  constructor(private readonly engagementService: EngagementService) {}

  @Post('reels/:strapiReelId/like')
  toggleReelLike(
    @Request() req,
    @Param('strapiReelId', ParseIntPipe) strapiReelId: number,
  ) {
    return this.engagementService.toggleReelLike(req.user.id, strapiReelId);
  }

  @Get('reels/:strapiReelId')
  getReelEngagement(
    @Request() req,
    @Param('strapiReelId', ParseIntPipe) strapiReelId: number,
  ) {
    return this.engagementService.getReelEngagement(req.user.id, strapiReelId);
  }

  @Put('messages/:messageId/reaction')
  setMessageReaction(
    @Request() req,
    @Param('messageId') messageId: string,
    @Body('emoji') emoji: string,
  ) {
    return this.engagementService.setMessageReaction(
      req.user.id,
      messageId,
      emoji,
    );
  }

  @Post('reels/:strapiReelId/share')
  shareReel(
    @Request() req,
    @Param('strapiReelId', ParseIntPipe) strapiReelId: number,
    @Body('conversationId') conversationId: string,
  ) {
    return this.engagementService.shareReel(
      req.user.id,
      strapiReelId,
      conversationId,
    );
  }
}
