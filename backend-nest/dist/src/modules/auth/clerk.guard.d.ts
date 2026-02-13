import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClerkService } from '../../integrations/clerk.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuthService } from './auth.service';
export declare class ClerkGuard implements CanActivate {
    private clerkService;
    private prisma;
    private authService;
    private reflector;
    constructor(clerkService: ClerkService, prisma: PrismaService, authService: AuthService, reflector: Reflector);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
