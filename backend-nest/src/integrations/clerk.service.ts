import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClerkService {
  constructor(private configService: ConfigService) { }

  async verifyToken(token: string): Promise<any | null> {
    try {
      // Simple token verification - in production, use proper Clerk SDK
      // This is a placeholder implementation
      if (!token) return null;

      // For E2E Testing: Accept "TEST_TOKEN_X" to simulate different users
      if (token.startsWith('TEST_TOKEN_')) {
        const userId = token.replace('TEST_TOKEN_', 'user_'); // e.g.,user_1
        return {
          id: userId,        // For ChatGateway
          userId: userId,    // For ClerkGuard
          sessionId: `session_${userId}`,
          email: `${userId}@test.com`,
          firstName: 'Test',
          lastName: userId.toUpperCase(),
        };
      }

      // For now, return a mock response for any other token
      return {
        id: 'mock_user_id',
        userId: 'mock_user_id',
        sessionId: 'mock_session_id',
        email: 'mock@test.com',
        firstName: 'Mock',
        lastName: 'User',
      };
    } catch (error) {
      console.error('Clerk token verification failed:', error);
      return null;
    }
  }

  async getUser(userId: string) {
    try {
      // Mock implementation - replace with actual Clerk API call
      return {
        id: userId,
        emailAddresses: [{ emailAddress: 'user@example.com' }],
        firstName: 'John',
        lastName: 'Doe',
      };
    } catch (error) {
      console.error('Failed to get user from Clerk:', error);
      return null;
    }
  }

  async createUser(userData: {
    emailAddress: string[];
    password?: string;
    firstName?: string;
    lastName?: string;
  }) {
    try {
      // Mock implementation - replace with actual Clerk API call
      return {
        id: 'new_user_id',
        ...userData,
      };
    } catch (error) {
      console.error('Failed to create user in Clerk:', error);
      throw error;
    }
  }
}