import { Controller, Post, Body, Put, Param, Get, UseGuards, Request } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { ClerkGuard } from '../auth/clerk.guard';

@Controller('sessions')
export class SessionsController {
    constructor(private readonly sessionsService: SessionsService) { }

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
    async getAnalysis(@Param('id') sessionId: string, @Request() req) {
        // Use the authenticated user's ID to filter the analysis
        return this.sessionsService.getSessionAnalysis(sessionId, req.user.id);
    }

    @Post(':id/end')
    async end(@Param('id') sessionId: string, @Body() data: { actualDuration: number; userEndedEarly: boolean; audioUrls: Record<string, string>; transcript?: string }) {
        return this.sessionsService.endSession(sessionId, data);
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
