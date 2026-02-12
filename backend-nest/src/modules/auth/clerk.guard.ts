import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClerkService } from '../../integrations/clerk.service';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class ClerkGuard implements CanActivate {
  constructor(
    private clerkService: ClerkService,
    private prisma: PrismaService,
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

    // Check if user exists in database
    const user = await this.prisma.user.findFirst({
      where: { clerkId: session.userId } // session.userId is the clerk ID (e.g. user_a)
    });

    if (!user) {
      // Option: throw error, or allow but without internal ID?
      // For E2E/APP, we expect user to exist if they have valid token?
      // Or just attach clerkId.
      // But FeedbackController needs internal ID.
      // Let's assume user must exist.
      throw new UnauthorizedException('User not found in database');
    }

    // Attach user information to request (Internal User)
    request.user = user;

    return true;
  }
}