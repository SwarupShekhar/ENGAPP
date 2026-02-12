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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AuthController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const clerk_guard_1 = require("./clerk.guard");
let AuthController = AuthController_1 = class AuthController {
    constructor(authService) {
        this.authService = authService;
        this.logger = new common_1.Logger(AuthController_1.name);
    }
    async getProfile(req) {
        try {
            const user = await this.authService.validateUser(req.user.clerkId);
            return {
                statusCode: common_1.HttpStatus.OK,
                message: 'Profile retrieved successfully',
                data: user,
            };
        }
        catch (error) {
            return {
                statusCode: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Failed to retrieve profile',
                error: error.message,
            };
        }
    }
    async getCurrentUser(req) {
        try {
            const user = await this.authService.validateUser(req.user.clerkId);
            return {
                statusCode: common_1.HttpStatus.OK,
                message: 'User retrieved successfully',
                data: user,
            };
        }
        catch (error) {
            return {
                statusCode: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Failed to retrieve user',
                error: error.message,
            };
        }
    }
    async registerUser(userData) {
        try {
            const user = await this.authService.createUser({
                clerkId: userData.clerkId,
                fname: userData.firstName,
                lname: userData.lastName,
                gender: userData.gender,
                hobbies: userData.hobbies || [],
                nativeLang: userData.nativeLang || 'english',
                level: userData.level || 'beginner',
            });
            return {
                statusCode: common_1.HttpStatus.CREATED,
                message: 'User registered successfully',
                data: user,
            };
        }
        catch (error) {
            return {
                statusCode: common_1.HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Failed to register user',
                error: error.message,
            };
        }
    }
    async clerkWebhook(body) {
        try {
            this.logger.log('Received Clerk webhook');
            return { status: 'handled' };
        }
        catch (error) {
            return { status: 'error', message: error.message };
        }
    }
    async healthCheck() {
        return {
            statusCode: common_1.HttpStatus.OK,
            message: 'Auth service is healthy',
            timestamp: new Date().toISOString(),
        };
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.UseGuards)(clerk_guard_1.ClerkGuard),
    (0, common_1.Get)('profile'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getProfile", null);
__decorate([
    (0, common_1.UseGuards)(clerk_guard_1.ClerkGuard),
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getCurrentUser", null);
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "registerUser", null);
__decorate([
    (0, common_1.Post)('webhook'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "clerkWebhook", null);
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "healthCheck", null);
exports.AuthController = AuthController = AuthController_1 = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map