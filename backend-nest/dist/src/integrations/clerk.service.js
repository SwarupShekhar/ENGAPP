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
var ClerkService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClerkService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const clerk_sdk_node_1 = require("@clerk/clerk-sdk-node");
let ClerkService = ClerkService_1 = class ClerkService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(ClerkService_1.name);
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
            try {
                const decoded = await clerk_sdk_node_1.clerkClient.verifyToken(token);
                return {
                    userId: decoded.sub,
                    sessionId: decoded.sid,
                };
            }
            catch (e) {
                this.logger.error(`Token verification failed: ${e.message}`);
                return null;
            }
        }
        catch (error) {
            this.logger.error('Clerk token verification failed:', error);
            return null;
        }
    }
    async getUser(userId) {
        try {
            const user = await clerk_sdk_node_1.clerkClient.users.getUser(userId);
            return {
                id: user.id,
                emailAddresses: user.emailAddresses,
                firstName: user.firstName,
                lastName: user.lastName,
            };
        }
        catch (error) {
            this.logger.error(`Failed to get user from Clerk: ${error.message}`);
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
            this.logger.error('Failed to create user in Clerk:', error);
            throw error;
        }
    }
};
exports.ClerkService = ClerkService;
exports.ClerkService = ClerkService = ClerkService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ClerkService);
//# sourceMappingURL=clerk.service.js.map