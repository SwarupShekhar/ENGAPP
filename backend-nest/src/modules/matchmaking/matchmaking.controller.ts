import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { TieredMatchmakingService } from './tiered-matchmaking.service';
import { MatchmakingService } from './matchmaking.service';

@Controller('matchmaking')
export class MatchmakingController {
    constructor(
        private matchmakingService: MatchmakingService,
        private tieredMatchmakingService: TieredMatchmakingService
    ) { }

    @Post('join')
    async joinQueue(@Body() body: { userId: string; englishLevel: string; topic?: string }) {
        return this.matchmakingService.joinQueue(body.userId, body.englishLevel, body.topic);
    }

    @Get('status')
    async checkMatch(@Query('userId') userId: string, @Query('level') level: string) {
        return this.matchmakingService.checkMatch(userId, level);
    }

    @Post('find-structured')
    async findStructuredMatch(@Body() body: { userId: string; structure: string }) {
        const result = await this.tieredMatchmakingService.findMatch(body.userId, body.structure);
        if (result) {
             return { matched: true, partnerId: result.partnerId, sessionId: result.sessionId };
        }
        return { matched: false };
    }
}
