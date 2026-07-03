import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ClerkGuard } from '../auth/clerk.guard';
import { ScoreAuthorityService } from './score-authority.service';

@Controller('scores')
@UseGuards(ClerkGuard)
export class ScoreAuthorityController {
  constructor(private readonly scoreAuthority: ScoreAuthorityService) {}

  @Get('profile')
  async getProfile(@Request() req: { user: { id: string } }) {
    return this.scoreAuthority.getProfile(req.user.id);
  }
}
