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
exports.ClerkService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let ClerkService = class ClerkService {
    constructor(configService) {
        this.configService = configService;
    }
    async verifyToken(token) {
        try {
            if (!token)
                return null;
            if (token.startsWith('TEST_TOKEN_')) {
                const userId = token.replace('TEST_TOKEN_', 'user_');
                return {
                    id: userId,
                    userId: userId,
                    sessionId: `session_${userId}`,
                    email: `${userId}@test.com`,
                    firstName: 'Test',
                    lastName: userId.toUpperCase(),
                };
            }
            return {
                id: 'mock_user_id',
                userId: 'mock_user_id',
                sessionId: 'mock_session_id',
                email: 'mock@test.com',
                firstName: 'Mock',
                lastName: 'User',
            };
        }
        catch (error) {
            console.error('Clerk token verification failed:', error);
            return null;
        }
    }
    async getUser(userId) {
        try {
            return {
                id: userId,
                emailAddresses: [{ emailAddress: 'user@example.com' }],
                firstName: 'John',
                lastName: 'Doe',
            };
        }
        catch (error) {
            console.error('Failed to get user from Clerk:', error);
            return null;
        }
    }
    async createUser(userData) {
        try {
            return {
                id: 'new_user_id',
                ...userData,
            };
        }
        catch (error) {
            console.error('Failed to create user in Clerk:', error);
            throw error;
        }
    }
};
exports.ClerkService = ClerkService;
exports.ClerkService = ClerkService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ClerkService);
//# sourceMappingURL=clerk.service.js.map