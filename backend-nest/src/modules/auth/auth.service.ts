import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ClerkService } from '../../integrations/clerk.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private clerkService: ClerkService,
  ) { }

  async validateUser(clerkId: string) {
    try {
      // First, try to find existing user in our database
      let user = await this.prisma.user.findUnique({
        where: { clerkId },
        include: { profile: true }
      });

      // If user doesn't exist, create them
      if (!user) {
        this.logger.log(`DEBUG: User ${clerkId} NOT in Neon DB. Creating now...`);
        const clerkUser = await this.clerkService.getUser(clerkId);
        if (!clerkUser) {
          throw new Error('User not found in Clerk');
        }

        user = await this.prisma.user.create({
          data: {
            clerkId,
            fname: clerkUser.firstName || '',
            lname: clerkUser.lastName || '',
            nativeLang: 'english',
            level: 'beginner',
            profile: {
              create: {} // Create default empty profile
            }
          },
          include: { profile: true }
        });
        this.logger.log(`DEBUG: User ${clerkId} successfully saved to PRISMA/NEON DATABASE.`);
      }

      return user;
    } catch (error) {
      this.logger.error(`Error validating user ${clerkId}:`, error);
      throw error;
    }
  }

  async getUserProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true }
    });
  }

  async createUser(userData: {
    clerkId: string;
    fname: string;
    lname: string;
    gender?: string;
    hobbies?: string[];
    nativeLang: string;
    level: string;
  }) {
    try {
      // Create user and profile in a single transaction (Prisma handles this via connectOrCreate or nested create)
      const user = await this.prisma.user.upsert({
        where: { clerkId: userData.clerkId },
        update: {
          gender: userData.gender,
          hobbies: userData.hobbies || [],
          nativeLang: userData.nativeLang,
          level: userData.level,
        },
        create: {
          clerkId: userData.clerkId,
          fname: userData.fname,
          lname: userData.lname,
          gender: userData.gender,
          hobbies: userData.hobbies || [],
          nativeLang: userData.nativeLang,
          level: userData.level,
          profile: {
            create: {}
          }
        },
        include: { profile: true }
      });

      return user;
    } catch (error) {
      this.logger.error('Error creating user:', error);
      throw error;
    }
  }
}