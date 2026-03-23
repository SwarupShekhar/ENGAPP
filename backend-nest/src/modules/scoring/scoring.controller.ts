import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ClerkGuard } from '../auth/clerk.guard';

@Controller('api/scoring')
export class ScoringController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('session/:sessionId')
  @UseGuards(ClerkGuard)
  async getCallQualityScore(@Param('sessionId') sessionId: string) {
    const scores = await this.prisma.callQualityScore.findFirst({
      where: { sessionId },
    });
    return scores;
  }
}
