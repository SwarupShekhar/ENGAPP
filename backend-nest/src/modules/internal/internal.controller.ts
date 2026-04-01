import {
  Controller,
  Post,
  Patch,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Controller('internal')
export class InternalController {
  constructor(private prisma: PrismaService) {}

  @Post('provision')
  async provision(
    @Headers('x-internal-secret') secret: string,
    @Body() body: { clerkId: string; email: string; fullName: string },
  ) {
    // Make sure this matches the variable name in your .env (INTERNAL_API_KEY or INTERNAL_BRIDGE_SECRET)
    const expectedSecret = process.env.INTERNAL_API_KEY || process.env.INTERNAL_BRIDGE_SECRET;

    if (secret !== expectedSecret) {
      throw new UnauthorizedException('Invalid internal secret');
    }

    const { clerkId, email, fullName } = body;

    // 1. Check if user exists
    const existing = await this.prisma.user.findUnique({ where: { clerkId } });

    if (existing) {
      // 2. If exists, update their info to keep it fresh
      await this.prisma.user.update({
        where: { clerkId },
        data: {
          email,
          fname: fullName?.split(' ')[0] ?? existing.fname,
          lname: fullName?.split(' ').slice(1).join(' ') ?? existing.lname,
        },
      });
      return { status: 'already_exists_updated' };
    }

    // 3. If new, create User + Profile
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          clerkId,
          email, // <--- THIS FIXES THE BUILD ERROR
          fname: fullName?.split(' ')[0] ?? 'User',
          lname: fullName?.split(' ').slice(1).join(' ') ?? '',
          nativeLang: 'unknown',
          level: 'A1',
        },
      });

      await tx.profile.create({
        data: { userId: user.id },
      });
    });

    return { status: 'provisioned' };
  }

  @Patch('update-cefr')
  async updateCefr(
    @Headers('x-internal-secret') secret: string,
    @Body() body: { clerkId: string; cefrLevel: string; fluencyScore: number },
  ) {
    const expectedSecret =
      process.env.INTERNAL_SECRET ||
      process.env.INTERNAL_API_KEY ||
      process.env.INTERNAL_BRIDGE_SECRET;

    if (secret !== expectedSecret) {
      throw new UnauthorizedException('Invalid internal secret');
    }

    const { clerkId, cefrLevel } = body;
    const existing = await this.prisma.user.findUnique({ where: { clerkId } });

    if (!existing) {
      return { status: 'not_found' };
    }

    await this.prisma.user.update({
      where: { clerkId },
      data: {
        level: cefrLevel,
        assessmentLevel: cefrLevel,
        levelUpdatedAt: new Date(),
      },
    });

    return { status: 'updated' };
  }
}
