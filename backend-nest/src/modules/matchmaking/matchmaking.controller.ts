import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';

@Controller('matchmaking')
export class MatchmakingController {
    constructor(private matchmakingService: MatchmakingService) { }

    @Post('join')
    async joinQueue(@Body() body: { userId: string; englishLevel: string; topic?: string }) {
        return this.matchmakingService.joinQueue(body.userId, body.englishLevel, body.topic);
    }

    @Get('status')
    async checkMatch(@Query('userId') userId: string, @Query('level') level: string) {
        return this.matchmakingService.checkMatch(userId, level);
    }
}
