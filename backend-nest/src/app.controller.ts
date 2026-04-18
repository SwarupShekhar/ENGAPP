import { Controller, Get, Logger } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth(): ReturnType<AppService['getHealth']> {
    // Makes Render “Logs” show traffic when the mobile probe or monitors hit /health
    this.logger.log('GET /health');
    return this.appService.getHealth();
  }
}