import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { register } from './prometheus';
import { MetricsAuthGuard } from '../guards/metrics-auth.guard';

@Controller()
export class MetricsController {
  @Get('metrics')
  @UseGuards(MetricsAuthGuard)
  @Header('Content-Type', register.contentType)
  async metrics(@Res() res: Response): Promise<void> {
    res.end(await register.metrics());
  }
}
