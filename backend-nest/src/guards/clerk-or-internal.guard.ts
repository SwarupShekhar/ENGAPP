import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { ClerkGuard } from '../modules/auth/clerk.guard';

/**
 * Accepts either a valid Clerk session (mobile) or x-internal-secret (scripts / internal jobs).
 */
@Injectable()
export class ClerkOrInternalGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly clerkGuard: ClerkGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-internal-secret'];
    const expected = this.config.get<string>('INTERNAL_API_KEY');

    if (
      expected &&
      typeof provided === 'string' &&
      provided.length > 0 &&
      provided === expected
    ) {
      (request as Request & { isInternal?: boolean }).isInternal = true;
      return true;
    }

    try {
      return await this.clerkGuard.canActivate(context);
    } catch {
      throw new UnauthorizedException(
        'Authentication required (Clerk token or x-internal-secret)',
      );
    }
  }
}
