import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { TieredMatchmakingService } from './tiered-matchmaking.service';
import { MatchmakingService } from './matchmaking.service';
import { ClerkGuard } from '../auth/clerk.guard';

@Controller('matchmaking')
@UseGuards(ClerkGuard)
export class MatchmakingController {
  constructor(
    private matchmakingService: MatchmakingService,
    private tieredMatchmakingService: TieredMatchmakingService,
  ) {}

  private clerkId(req: { user: { clerkId: string } }): string {
    return req.user.clerkId;
  }

  @Post('join')
  async joinQueue(
    @Request() req: { user: { clerkId: string } },
    @Body() body: { englishLevel: string; topic?: string; userId?: string },
  ) {
    if (body.userId && body.userId !== req.user.clerkId) {
      throw new ForbiddenException('userId does not match authenticated user');
    }
    return this.matchmakingService.joinQueue(
      this.clerkId(req),
      body.englishLevel,
      body.topic,
    );
  }

  @Get('status')
  async checkMatch(
    @Request() req: { user: { clerkId: string } },
    @Query('level') level: string,
    @Query('userId') userId?: string,
  ) {
    if (userId && userId !== req.user.clerkId) {
      throw new ForbiddenException('userId does not match authenticated user');
    }
    return this.matchmakingService.checkMatch(this.clerkId(req), level);
  }

  @Post('leave')
  async leaveQueue(
    @Request() req: { user: { clerkId: string } },
    @Body() body: { level: string; userId?: string },
  ) {
    if (body.userId && body.userId !== req.user.clerkId) {
      throw new ForbiddenException('userId does not match authenticated user');
    }
    return this.matchmakingService.leaveQueue(this.clerkId(req), body.level);
  }

  @Post('find-structured')
  async findStructuredMatch(
    @Request() req: { user: { clerkId: string } },
    @Body() body: { structure: string; userId?: string },
  ) {
    if (body.userId && body.userId !== req.user.clerkId) {
      throw new ForbiddenException('userId does not match authenticated user');
    }
    const result = await this.tieredMatchmakingService.findMatch(
      this.clerkId(req),
      body.structure,
    );
    if (result) {
      return {
        matched: true,
        partnerId: result.partnerId,
        sessionId: result.sessionId,
      };
    }
    return { matched: false };
  }
}
