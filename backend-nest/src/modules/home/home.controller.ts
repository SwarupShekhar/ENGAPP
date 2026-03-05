import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { HomeService } from './home.service';
import { ClerkGuard } from '../auth/clerk.guard';

@Controller('home')
@UseGuards(ClerkGuard)
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  async getHomeData(@Request() req) {
    return this.homeService.getHomeData(req.user.id);
  }
}
