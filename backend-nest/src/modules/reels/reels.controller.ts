import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ClerkGuard } from '../auth/clerk.guard';
import { ReelsService } from './reels.service';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';

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
    description:
      'Return a smart-ranked feed of Reels with activities. Weakness reels appear first.',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Cursor for pagination (index offset)',
  })
  async getFeed(@Req() req: any, @Query('cursor') cursor?: string) {
    const userId = req.user.id;
    const cursorNum = cursor ? parseInt(cursor, 10) : undefined;
    return this.reelsService.getFeed(userId, cursorNum);
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

  @Post('watch')
  @UseGuards(ClerkGuard)
  @ApiOperation({
    summary: 'Record that a user watched a reel (for feed deduplication)',
  })
  async recordWatch(
    @Req() req: any,
    @Body() data: { strapiReelId: number; completed: boolean },
  ) {
    const userId = req.user.id;
    await this.reelsService.recordReelWatch(
      userId,
      data.strapiReelId,
      data.completed,
    );
    return { success: true };
  }
}
