import { Controller, Get, Logger, NotFoundException } from '@nestjs/common';
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

  @Get('debug-sentry')
  debugSentry(): string {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    throw new Error('My first Sentry error!');
  }
}