import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { clerkClient } from '@clerk/clerk-sdk-node';

@Injectable()
export class ClerkService {
  private readonly logger = new Logger(ClerkService.name);

  constructor(private configService: ConfigService) {}

  async verifyToken(token: string): Promise<any | null> {
    try {
      if (!token) return null;

      // For E2E Testing: Accept "TEST_TOKEN_X" to simulate different users
      if (token.startsWith('TEST_TOKEN_')) {
        const userId = token.replace('TEST_TOKEN_', 'user_'); // e.g.,user_1
        return {
          id: userId, // For ChatGateway
          userId: userId, // For ClerkGuard
          sessionId: `session_${userId}`,
          email: `${userId}@test.com`,
          firstName: 'Test',
          lastName: userId.toUpperCase(),
        };
      }

      // Real Token Verification
      try {
        const decoded = await clerkClient.verifyToken(token);

        return {
          userId: decoded.sub,
          sessionId: decoded.sid,
          // Note: Standard JWT doesn't check claims for email/name unless configured.
          // We rely on getUser to fetch details when creating the user.
        };
      } catch (e) {
        this.logger.error(`Token verification failed: ${e.message}`);
        this.logger.error(`Token error details:`, e);
        return null;
      }
    } catch (error) {
      this.logger.error('Clerk token verification failed:', error);
      return null;
    }
  }

  async getUser(userId: string) {
    try {
      const user = await clerkClient.users.getUser(userId);
      return {
        id: user.id,
        emailAddresses: user.emailAddresses,
        firstName: user.firstName,
        lastName: user.lastName,
      };
    } catch (error) {
      this.logger.error(`Failed to get user from Clerk: ${error.message}`);
      return null;
    }
  }

  async createUser(userData: {
    emailAddress: string[];
    password?: string;
    firstName?: string;
    lastName?: string;
  }) {
    // This method is primarily for testing or admin creation, assume mock for now or implement if needed.
    // Since we are syncing FROM Clerk (signup happens on frontend), we might not need this.
    // Leaving as is or simple mock to satisfy interface if used.
    try {
      // Mock implementation for now as we don't create Clerk users from backend usually
      return {
        id: 'new_user_id',
        ...userData,
      };
    } catch (error) {
      this.logger.error('Failed to create user in Clerk:', error);
      throw error;
    }
  }
}
