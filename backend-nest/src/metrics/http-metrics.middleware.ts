import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import {
  httpRequestDuration,
  httpRequestsTotal,
  normalizeRoute,
} from './prometheus';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const path = req.path || req.url?.split('?')[0] || '/';
    if (path === '/metrics' || path === '/health') {
      next();
      return;
    }

    const end = httpRequestDuration.startTimer();
    res.on('finish', () => {
      const route = normalizeRoute(path);
      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };
      end(labels);
      httpRequestsTotal.inc(labels);
    });

    next();
  }
}
