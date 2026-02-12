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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma/prisma.service");
const clerk_service_1 = require("../../integrations/clerk.service");
let AuthService = AuthService_1 = class AuthService {
    constructor(prisma, clerkService) {
        this.prisma = prisma;
        this.clerkService = clerkService;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    async validateUser(clerkId) {
        try {
            let user = await this.prisma.user.findUnique({
                where: { clerkId },
                include: { profile: true }
            });
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
                            create: {}
                        }
                    },
                    include: { profile: true }
                });
                this.logger.log(`DEBUG: User ${clerkId} successfully saved to PRISMA/NEON DATABASE.`);
            }
            return user;
        }
        catch (error) {
            this.logger.error(`Error validating user ${clerkId}:`, error);
            throw error;
        }
    }
    async getUserProfile(userId) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            include: { profile: true }
        });
    }
    async createUser(userData) {
        try {
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
        }
        catch (error) {
            this.logger.error('Error creating user:', error);
            throw error;
        }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        clerk_service_1.ClerkService])
], AuthService);
//# sourceMappingURL=auth.service.js.map