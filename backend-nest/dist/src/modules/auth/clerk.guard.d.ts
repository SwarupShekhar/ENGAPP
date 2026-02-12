import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClerkService } from '../../integrations/clerk.service';
import { PrismaService } from '../../database/prisma/prisma.service';
export declare class ClerkGuard implements CanActivate {
    private clerkService;
    private prisma;
    private reflector;
    constructor(clerkService: ClerkService, prisma: PrismaService, reflector: Reflector);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
