import { Controller, Get, Request, UseGuards } from '@nestjs/common';
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
}
