import { Controller, Post, Body, Put, Param, Get } from '@nestjs/common';
import { SessionsService } from './sessions.service';

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

    @Post(':id/end')
    async end(@Param('id') sessionId: string, @Body() data: { actualDuration: number; userEndedEarly: boolean; audioUrls: Record<string, string> }) {
        return this.sessionsService.endSession(sessionId, data);
    }
}
