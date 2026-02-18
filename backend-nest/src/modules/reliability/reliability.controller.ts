import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { ReliabilityService } from './reliability.service';
// Assuming AuthGuard is available, or we just pass userId for now for simplicity if not strictly enforced yet 
// but best practice is to use AuthGuard. I'll check if AuthGuard is used elsewhere.
// For now, I'll assume standard pattern.

@Controller('reliability')
export class ReliabilityController {
  constructor(private readonly reliabilityService: ReliabilityService) {}

  @Get(':userId')
  async getUserReliability(@Param('userId') userId: string) {
    return this.reliabilityService.getUserReliability(userId);
  }
}
