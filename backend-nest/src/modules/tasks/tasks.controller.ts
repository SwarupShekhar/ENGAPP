import {
    Controller, Get, Post, Patch, Body, Param, Request, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TasksService } from './tasks.service';
import { ClerkGuard } from '../auth/clerk.guard';

@Controller('tasks')
export class TasksController {
    constructor(private tasksService: TasksService) { }

    @UseGuards(ClerkGuard)
    @Get('daily')
    async getDailyTasks(@Request() req) {
        const tasks = await this.tasksService.getDailyTasks(req.user.id);
        return { tasks };
    }

    @UseGuards(ClerkGuard)
    @Post(':id/complete')
    async completeTask(@Param('id') id: string, @Body() body: { score: number }) {
        return this.tasksService.completeTask(id, body.score);
    }

    @UseGuards(ClerkGuard)
    @Patch(':id/complete')
    async completeTaskV2(@Param('id') id: string, @Request() req) {
        return this.tasksService.completeTaskForUser(id, req.user.id);
    }

    @UseGuards(ClerkGuard)
    @Get('due')
    async getDue(@Request() req) {
        const tasks = await this.tasksService.getDueTasksForUser(req.user.id);
        return { tasks };
    }

    @UseGuards(ClerkGuard)
    @Get('mastered-count')
    async masteredCount(@Request() req) {
        return { count: await this.tasksService.getMasteredCount(req.user.id) };
    }

    @UseGuards(ClerkGuard)
    @Post(':id/attempt')
    @UseInterceptors(FileInterceptor('audio'))
    async attempt(
        @Param('id') id: string,
        @Request() req,
        @Body() body: { transcript?: string },
        @UploadedFile() audio?: { buffer: Buffer; originalname: string; mimetype: string },
    ) {
        return this.tasksService.submitAttempt(id, req.user.id, {
            transcript: body?.transcript,
            file: audio,
        });
    }
}
