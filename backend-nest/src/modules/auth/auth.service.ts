import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/postgres/database.service';
import { ClerkService } from '../../integrations/clerk.service';

@Injectable()
export class AuthService {
  constructor(
    private database: DatabaseService,
    private clerkService: ClerkService,
  ) { }

  async validateUser(clerkId: string) {
    try {
      // First, try to find existing user in our database
      const result = await this.database.query(
        'SELECT * FROM "User" WHERE "clerkId" = $1',
        [clerkId]
      );

      let user = result.rows[0];

      // If user doesn't exist, create them
      if (!user) {
        const clerkUser = await this.clerkService.getUser(clerkId);
        if (!clerkUser) {
          throw new Error('User not found in Clerk');
        }

        const insertResult = await this.database.query(
          'INSERT INTO "User" ("clerkId", "fname", "lname", "nativeLang", "level", "createdAt") VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
          [clerkId, clerkUser.firstName || '', clerkUser.lastName || '', 'english', 'beginner']
        );

        user = insertResult.rows[0];
      }

      return user;
    } catch (error) {
      console.error('Error validating user:', error);
      throw error;
    }
  }

  async getUserProfile(userId: string) {
    const result = await this.database.query(
      'SELECT * FROM "User" WHERE "id" = $1',
      [userId]
    );
    return result.rows[0];
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
      // Check if user already exists
      const existing = await this.database.query(
        'SELECT * FROM "User" WHERE "clerkId" = $1',
        [userData.clerkId]
      );
      if (existing.rows.length > 0) {
        return existing.rows[0]; // Already registered
      }

      // Format hobbies as PostgreSQL array literal: {item1,item2}
      const hobbiesArr = userData.hobbies && userData.hobbies.length > 0
        ? `{${userData.hobbies.map(h => `"${h.replace(/"/g, '\\"')}"`).join(',')}}`
        : '{}';

      const result = await this.database.query(
        'INSERT INTO "User" ("clerkId", "fname", "lname", "gender", "hobbies", "nativeLang", "level", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::text[], $6, $7, NOW(), NOW()) RETURNING *',
        [
          userData.clerkId,
          userData.fname,
          userData.lname,
          userData.gender || null,
          hobbiesArr,
          userData.nativeLang,
          userData.level
        ]
      );

      const user = result.rows[0];

      // Create default profile
      try {
        await this.database.query(
          'INSERT INTO "Profile" ("id", "userId") VALUES (gen_random_uuid(), $1)',
          [user.id]
        );
      } catch (profileErr) {
        console.log('Profile creation skipped (may already exist):', profileErr);
      }

      return user;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }
}