import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClerkService } from '../../integrations/clerk.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuthService } from './auth.service';

@Injectable()
export class ClerkGuard implements CanActivate {
  constructor(
    private clerkService: ClerkService,
    private prisma: PrismaService,
    private authService: AuthService,
    private reflector: Reflector,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException('Bearer token is missing');
    }

    const session = await this.clerkService.verifyToken(token);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Check if user exists in database (and create if not)
    // We use AuthService.validateUser to handle the sync logic
    try {
      const user = await this.authService.validateUser(session.userId);

      if (!user) {
        throw new UnauthorizedException('User could not be validated or created');
      }

      // Attach user information to request (Internal User)
      request.user = user;
      return true;

    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      // If validation fails (e.g. Clerk API error), we deny access
      throw new UnauthorizedException(`User validation failed: ${e.message}`);
    }
  }
}