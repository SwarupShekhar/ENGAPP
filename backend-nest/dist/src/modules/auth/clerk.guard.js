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
exports.ClerkGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const clerk_service_1 = require("../../integrations/clerk.service");
const prisma_service_1 = require("../../database/prisma/prisma.service");
const auth_service_1 = require("./auth.service");
let ClerkGuard = class ClerkGuard {
    constructor(clerkService, prisma, authService, reflector) {
        this.clerkService = clerkService;
        this.prisma = prisma;
        this.authService = authService;
        this.reflector = reflector;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            throw new common_1.UnauthorizedException('Authorization header is missing');
        }
        const token = authHeader.replace('Bearer ', '');
        if (!token) {
            throw new common_1.UnauthorizedException('Bearer token is missing');
        }
        const session = await this.clerkService.verifyToken(token);
        if (!session) {
            throw new common_1.UnauthorizedException('Invalid or expired token');
        }
        try {
            const user = await this.authService.validateUser(session.userId);
            if (!user) {
                throw new common_1.UnauthorizedException('User could not be validated or created');
            }
            request.user = user;
            return true;
        }
        catch (e) {
            if (e instanceof common_1.UnauthorizedException)
                throw e;
            throw new common_1.UnauthorizedException(`User validation failed: ${e.message}`);
        }
    }
};
exports.ClerkGuard = ClerkGuard;
exports.ClerkGuard = ClerkGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [clerk_service_1.ClerkService,
        prisma_service_1.PrismaService,
        auth_service_1.AuthService,
        core_1.Reflector])
], ClerkGuard);
//# sourceMappingURL=clerk.guard.js.map