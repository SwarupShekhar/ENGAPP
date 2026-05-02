import { Controller, Get, Post, Delete, UseGuards, Request, Body, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { ClerkGuard } from '../auth/clerk.guard';
import { TasksService } from '../tasks/tasks.service';
import { DeviceTokenDto } from './dto/device-token.dto';

@Controller('users')
@UseGuards(ClerkGuard)
export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly tasksService: TasksService,
    ) { }

    @Get('me/stats')
    async getStats(@Request() req) {
        // req.user is populated by ClerkGuard with the Prisma User entity
        return this.usersService.getUserStats(req.user.id);
    }

    @Get('me/history')
    async getHistory(@Request() req) {
        return this.usersService.getUserHistory(req.user.id);
    }

    @Get('me/tasks/pending')
    async getPendingTasks(@Request() req) {
        const tasks = await this.tasksService.getPendingTasksForUser(req.user.id, 10);
        return { tasks };
    }

    @Post('me/device-token')
    async registerDeviceToken(
        @Body() dto: DeviceTokenDto,
        @Request() req: any,
    ): Promise<{ ok: boolean }> {
        const userId = req.user.id;
        await this.usersService.upsertDeviceToken(userId, dto.deviceToken, dto.platform);
        return { ok: true };
    }

    @Delete('me/device-token')
    async removeDeviceToken(
        @Query('token') token: string,
        @Request() req: any,
    ): Promise<{ ok: boolean }> {
        const userId = req.user.id;
        await this.usersService.removeDeviceToken(userId, token);
        return { ok: true };
    }
}
