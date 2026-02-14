import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { ClerkGuard } from '../auth/clerk.guard';

@Controller('users')
@UseGuards(ClerkGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('me/stats')
    async getStats(@Request() req) {
        // req.user is populated by ClerkGuard with the Prisma User entity
        return this.usersService.getUserStats(req.user.id);
    }

    @Get('me/history')
    async getHistory(@Request() req) {
        return this.usersService.getUserHistory(req.user.id);
    }
}
