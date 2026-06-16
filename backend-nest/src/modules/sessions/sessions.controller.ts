import {
  Controller,
  Post,
  Body,
  Put,
  Param,
  Get,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import axios from 'axios';
import { SessionsService } from './sessions.service';
import { ClerkGuard } from '../auth/clerk.guard';
import { ClerkOrInternalGuard } from '../../guards/clerk-or-internal.guard';
import { TasksService } from '../tasks/tasks.service';

@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly tasksService: TasksService,
  ) {}

  @Post('start')
  @UseGuards(ClerkOrInternalGuard)
  async start(
    @Request() req: { user?: { id: string }; isInternal?: boolean },
    @Body()
    data: {
      matchId: string;
      participants: string[];
      topic: string;
      estimatedDuration: number;
    },
  ) {
    if (!req.isInternal && req.user?.id) {
      if (!data.participants?.includes(req.user.id)) {
        throw new ForbiddenException(
          'Authenticated user must be included in participants',
        );
      }
    }
    return this.sessionsService.startSession(data);
  }

  @Put(':id/heartbeat')
  @UseGuards(ClerkGuard)
  async heartbeat(
    @Param('id') sessionId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.sessionsService.heartbeat(sessionId, req.user.id);
  }

  @Get()
  @UseGuards(ClerkGuard)
  async getAll(
    @Request() req,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const page = await this.sessionsService.getUserSessions(req.user.id, {
      limit: Number.isFinite(limit) ? limit : undefined,
      cursor: cursor || undefined,
    });
    if (limitStr || cursor) {
      return page;
    }
    return page.items;
  }

  @Get('count')
  @UseGuards(ClerkGuard)
  async getCount(@Request() req) {
    return this.sessionsService.getUserSessionsCount(req.user.id);
  }

  @Get('upcoming')
  @UseGuards(ClerkGuard)
  async getUpcoming(@Request() req) {
    return this.sessionsService.getUserUpcomingSession(req.user.id);
  }

  @Post('bridge/streak')
  @UseGuards(ClerkGuard)
  async incrementBridgeStreak(@Request() req: { user: { clerkId: string } }) {
    const bridgeApiUrl = process.env.BRIDGE_API_URL;
    const internalSecret = process.env.INTERNAL_SECRET;
    if (!bridgeApiUrl || !internalSecret)
      return { ok: false, reason: 'bridge not configured' };
    await axios.patch(
      `${bridgeApiUrl}/user/${req.user.clerkId}/streak`,
      {},
      { headers: { 'x-internal-secret': internalSecret } },
    );
    return { ok: true };
  }

  @Post('bridge/minutes')
  @UseGuards(ClerkGuard)
  async addBridgeMinutes(
    @Request() req: { user: { clerkId: string } },
    @Body() body: { minutes: number },
  ) {
    const bridgeApiUrl = process.env.BRIDGE_API_URL;
    const internalSecret = process.env.INTERNAL_SECRET;
    if (!bridgeApiUrl || !internalSecret)
      return { ok: false, reason: 'bridge not configured' };
    await axios.patch(
      `${bridgeApiUrl}/user/${req.user.clerkId}/minutes`,
      { minutes: body.minutes },
      { headers: { 'x-internal-secret': internalSecret } },
    );
    return { ok: true };
  }

  @Get(':id/analysis')
  @UseGuards(ClerkGuard)
  async getAnalysis(
    @Param('id') sessionId: string,
    @Request() req,
    @Query('retry') retry?: string,
  ) {
    return this.sessionsService.getSessionAnalysis(sessionId, req.user.id, {
      retry: retry === '1' || retry === 'true',
    });
  }

  @Post(':id/pronunciation/rerun')
  @UseGuards(ClerkGuard)
  async rerunPronunciation(@Param('id') sessionId: string, @Request() req) {
    return this.sessionsService.rerunPronunciationForSession(
      sessionId,
      req.user.id,
    );
  }

  @Post(':id/end')
  @UseGuards(ClerkGuard)
  async end(
    @Param('id') sessionId: string,
    @Request() req: { user: { id: string } },
    @Body()
    data: {
      actualDuration?: number;
      userEndedEarly?: boolean;
      audioUrls?: Record<string, string>;
      transcript?: { speaker_id: string; text: string; timestamp?: string }[];
    },
  ) {
    return this.sessionsService.endSession(sessionId, req.user.id, data);
  }

  @Post(':id/tasks/generate')
  @UseGuards(ClerkGuard)
  async generateTasks(
    @Param('id') sessionId: string,
    @Request() req: { user: { id: string } },
  ) {
    const tasks = await this.tasksService.generateTasksForSession(
      sessionId,
      req.user.id,
    );
    return { tasks };
  }

  @Post(':id/participant/:userId/audio')
  @UseGuards(ClerkGuard)
  async updateAudio(
    @Param('id') sessionId: string,
    @Param('userId') userId: string,
    @Request() req: { user: { id: string } },
    @Body() data: { audioUrl: string },
  ) {
    if (userId !== req.user.id) {
      throw new ForbiddenException('Cannot update another participant audio');
    }
    return this.sessionsService.updateParticipantAudio(
      sessionId,
      req.user.id,
      data.audioUrl,
    );
  }

  @Post('upload-audio')
  @UseGuards(ClerkGuard)
  async uploadAudio(
    @Request() req: { user: { id: string } },
    @Body() data: { audioBase64: string; sessionId: string; userId?: string },
  ) {
    if (data.userId && data.userId !== req.user.id) {
      throw new ForbiddenException('userId does not match authenticated user');
    }
    return this.sessionsService.uploadAudio(
      req.user.id,
      data.sessionId,
      data.audioBase64,
    );
  }
}
