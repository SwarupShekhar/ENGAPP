"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../../database/postgres/database.service");
const clerk_service_1 = require("../../integrations/clerk.service");
let AuthService = class AuthService {
    constructor(database, clerkService) {
        this.database = database;
        this.clerkService = clerkService;
    }
    async validateUser(clerkId) {
        try {
            const result = await this.database.query('SELECT * FROM "User" WHERE "clerkId" = $1', [clerkId]);
            let user = result.rows[0];
            if (!user) {
                const clerkUser = await this.clerkService.getUser(clerkId);
                if (!clerkUser) {
                    throw new Error('User not found in Clerk');
                }
                const insertResult = await this.database.query('INSERT INTO "User" ("clerkId", "fname", "lname", "nativeLang", "level", "createdAt") VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *', [clerkId, clerkUser.firstName || '', clerkUser.lastName || '', 'english', 'beginner']);
                user = insertResult.rows[0];
            }
            return user;
        }
        catch (error) {
            console.error('Error validating user:', error);
            throw error;
        }
    }
    async getUserProfile(userId) {
        const result = await this.database.query('SELECT * FROM "User" WHERE "id" = $1', [userId]);
        return result.rows[0];
    }
    async createUser(userData) {
        try {
            const existing = await this.database.query('SELECT * FROM "User" WHERE "clerkId" = $1', [userData.clerkId]);
            if (existing.rows.length > 0) {
                return existing.rows[0];
            }
            const hobbiesArr = userData.hobbies && userData.hobbies.length > 0
                ? `{${userData.hobbies.map(h => `"${h.replace(/"/g, '\\"')}"`).join(',')}}`
                : '{}';
            const result = await this.database.query('INSERT INTO "User" ("clerkId", "fname", "lname", "gender", "hobbies", "nativeLang", "level", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::text[], $6, $7, NOW(), NOW()) RETURNING *', [
                userData.clerkId,
                userData.fname,
                userData.lname,
                userData.gender || null,
                hobbiesArr,
                userData.nativeLang,
                userData.level
            ]);
            const user = result.rows[0];
            try {
                await this.database.query('INSERT INTO "Profile" ("id", "userId") VALUES (gen_random_uuid(), $1)', [user.id]);
            }
            catch (profileErr) {
                console.log('Profile creation skipped (may already exist):', profileErr);
            }
            return user;
        }
        catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        clerk_service_1.ClerkService])
], AuthService);
//# sourceMappingURL=auth.service.js.map