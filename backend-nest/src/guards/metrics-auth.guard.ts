import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/** Allow Prometheus scrapes from private networks or with a shared secret header. */
@Injectable()
export class MetricsAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const secret =
      this.config.get<string>('METRICS_SCRAPE_TOKEN') ||
      this.config.get<string>('INTERNAL_API_KEY');

    if (secret) {
      const header = request.headers['x-metrics-token'];
      const provided = Array.isArray(header) ? header[0] : header;
      if (provided === secret) {
        return true;
      }
    }

    const ip = request.ip || request.socket?.remoteAddress || '';
    if (this.isPrivateIp(ip)) {
      return true;
    }

    throw new UnauthorizedException('Metrics endpoint is not accessible');
  }

  private isPrivateIp(ip: string): boolean {
    const normalized = ip.replace(/^::ffff:/, '');
    if (normalized === '127.0.0.1' || normalized === '::1') {
      return true;
    }
    if (normalized.startsWith('10.')) return true;
    if (normalized.startsWith('192.168.')) return true;
    const match = /^172\.(\d+)\./.exec(normalized);
    if (match) {
      const second = Number(match[1]);
      return second >= 16 && second <= 31;
    }
    return false;
  }
}
