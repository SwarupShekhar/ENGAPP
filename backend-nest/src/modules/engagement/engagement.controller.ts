import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
  ParseIntPipe,
  Query,
  DefaultValuePipe,
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

  @Get('reels/:strapiReelId/comments')
  getReelComments(
    @Request() req,
    @Param('strapiReelId', ParseIntPipe) strapiReelId: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.engagementService.getReelComments(
      req.user.id,
      strapiReelId,
      cursor,
      limit,
    );
  }

  @Post('reels/:strapiReelId/comments')
  createReelComment(
    @Request() req,
    @Param('strapiReelId', ParseIntPipe) strapiReelId: number,
    @Body('body') body: string,
  ) {
    return this.engagementService.createReelComment(
      req.user.id,
      strapiReelId,
      body,
    );
  }

  @Delete('reels/:strapiReelId/comments/:commentId')
  deleteReelComment(
    @Request() req,
    @Param('strapiReelId', ParseIntPipe) strapiReelId: number,
    @Param('commentId') commentId: string,
  ) {
    return this.engagementService.deleteReelComment(
      req.user.id,
      strapiReelId,
      commentId,
    );
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
    @Body()
    body: {
      conversationId: string;
      snapshot?: {
        title?: string;
        thumbnailUrl?: string | null;
        muxPlaybackId?: string;
      };
    },
  ) {
    return this.engagementService.shareReel(
      req.user.id,
      strapiReelId,
      body.conversationId,
      body.snapshot,
    );
  }
}
