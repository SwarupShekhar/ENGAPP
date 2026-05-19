import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { register } from './prometheus';

@Controller()
export class MetricsController {
  @Get('metrics')
  @Header('Content-Type', register.contentType)
  async metrics(@Res() res: Response): Promise<void> {
    res.end(await register.metrics());
  }
}
