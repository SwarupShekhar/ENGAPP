import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class InternalSecretGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-internal-secret'];
    const expected = this.configService.get<string>('INTERNAL_API_KEY');

    if (!expected) {
      throw new UnauthorizedException('INTERNAL_API_KEY is not configured');
    }

    if (!provided || Array.isArray(provided) || provided !== expected) {
      throw new UnauthorizedException('Invalid or missing x-internal-secret header');
    }

    return true;
  }
}

