import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ClerkGuard } from '../auth/clerk.guard';
import { ReelsService } from './reels.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Reels')
@Controller('reels')
export class ReelsController {
  constructor(private readonly reelsService: ReelsService) {}

  @Get('feed')
  @UseGuards(ClerkGuard)
  @ApiOperation({
    summary: 'Get a personalized reels feed based on user weaknesses',
  })
  @ApiResponse({
    status: 200,
    description: 'Return a mixed feed of Reels with activities.',
  })
  async getFeed(@Req() req: any) {
    const userId = req.user.id;
    return this.reelsService.getFeed(userId);
  }

  @Post('activity/submit')
  @UseGuards(ClerkGuard)
  @ApiOperation({
    summary: 'Submit an activity result and update weakness score',
  })
  async submitActivity(
    @Req() req: any,
    @Body() data: { reelId: string; isCorrect: boolean; topicTag: string },
  ) {
    const userId = req.user.id;
    return this.reelsService.submitActivityResult(
      userId,
      data.reelId,
      data.isCorrect,
      data.topicTag,
    );
  }
}
