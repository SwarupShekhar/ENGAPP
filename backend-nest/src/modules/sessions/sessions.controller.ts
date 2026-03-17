import { Controller, Post, Body, Put, Param, Get, Query, UseGuards, Request } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { ClerkGuard } from '../auth/clerk.guard';
import { TasksService } from '../tasks/tasks.service';

@Controller('sessions')
export class SessionsController {
    constructor(
        private readonly sessionsService: SessionsService,
        private readonly tasksService: TasksService,
    ) { }

    @Post('start')
    async start(@Body() data: { matchId: string; participants: string[]; topic: string; estimatedDuration: number }) {
        return this.sessionsService.startSession(data);
    }

    @Put(':id/heartbeat')
    async heartbeat(@Param('id') sessionId: string, @Body() data: { userId: string }) {
        return this.sessionsService.heartbeat(sessionId, data.userId);
    }

    @Get()
    @UseGuards(ClerkGuard)
    async getAll(@Request() req) {
        console.log('GET /sessions hit for user:', req.user.id);
        return this.sessionsService.getUserSessions(req.user.id);
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
    async generateTasks(@Param('id') sessionId: string, @Request() req: { user: { id: string } }) {
        const tasks = await this.tasksService.generateTasksForSession(sessionId, req.user.id);
        return { tasks };
    }

    @Post(':id/participant/:userId/audio')
    async updateAudio(@Param('id') sessionId: string, @Param('userId') userId: string, @Body() data: { audioUrl: string }) {
        return this.sessionsService.updateParticipantAudio(sessionId, userId, data.audioUrl);
    }

    @Post('upload-audio')
    async uploadAudio(@Body() data: { audioBase64: string; userId: string; sessionId: string }) {
        return this.sessionsService.uploadAudio(data.userId, data.sessionId, data.audioBase64);
    }
}
