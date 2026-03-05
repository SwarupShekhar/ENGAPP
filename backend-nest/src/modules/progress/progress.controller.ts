import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { ClerkGuard } from '../auth/clerk.guard';

@Controller('progress')
@UseGuards(ClerkGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Get('detailed-metrics')
  async getDetailedMetrics(@Request() req) {
    return this.progressService.getDetailedMetrics(req.user.id);
  }
}
