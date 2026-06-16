import { Controller, Get, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ReliabilityService } from './reliability.service';
import { ClerkGuard } from '../auth/clerk.guard';

@Controller('reliability')
@UseGuards(ClerkGuard)
export class ReliabilityController {
  constructor(private readonly reliabilityService: ReliabilityService) {}

  @Get(':userId')
  async getUserReliability(
    @Param('userId') userId: string,
    @Request() req: { user: { id: string } },
  ) {
    if (userId !== req.user.id) {
      throw new ForbiddenException('Cannot read another user reliability score');
    }
    return this.reliabilityService.getUserReliability(req.user.id);
  }
}
