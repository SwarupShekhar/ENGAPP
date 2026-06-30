import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit by authenticated Clerk user when available; otherwise by client IP.
 * Works behind Caddy/nginx when X-Forwarded-For is set.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const user = req.user;
    if (user?.clerkId) return `clerk:${user.clerkId}`;
    if (user?.id) return `uid:${user.id}`;

    const forwarded = req.headers?.['x-forwarded-for'];
    const ip =
      (typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : undefined) ||
      req.ip ||
      req.socket?.remoteAddress;
    return `ip:${ip ?? 'unknown'}`;
  }
}
