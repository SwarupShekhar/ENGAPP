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
var ReviewsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma/prisma.service");
let ReviewsService = ReviewsService_1 = class ReviewsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ReviewsService_1.name);
    }
    async submitReview(data) {
        try {
            const participants = await this.prisma.sessionParticipant.findMany({
                where: { sessionId: data.sessionId },
                select: { userId: true },
            });
            const userIds = participants.map(p => p.userId);
            if (!userIds.includes(data.reviewerId) || !userIds.includes(data.revieweeId)) {
                throw new common_1.BadRequestException('Invalid session participants for review');
            }
            if (data.reviewerId === data.revieweeId) {
                throw new common_1.BadRequestException('You cannot review yourself');
            }
            return await this.prisma.partnerReview.create({
                data: {
                    sessionId: data.sessionId,
                    reviewerId: data.reviewerId,
                    revieweeId: data.revieweeId,
                    rating: data.rating,
                    comment: data.comment,
                },
            });
        }
        catch (error) {
            this.logger.error(`Failed to submit review: ${error.message}`);
            throw error;
        }
    }
    async getReviewsReceived(userId) {
        return this.prisma.partnerReview.findMany({
            where: { revieweeId: userId },
            include: {
                reviewer: {
                    select: { fname: true, lname: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async blockUser(blockerId, blockedUserId) {
        if (blockerId === blockedUserId) {
            throw new common_1.BadRequestException('You cannot block yourself');
        }
        try {
            return await this.prisma.blockedUser.upsert({
                where: {
                    blockerId_blockedUserId: { blockerId, blockedUserId },
                },
                update: {},
                create: {
                    blockerId,
                    blockedUserId,
                },
            });
        }
        catch (error) {
            this.logger.error(`Failed to block user: ${error.message}`);
            throw error;
        }
    }
    async getBlockedUsers(userId) {
        return this.prisma.blockedUser.findMany({
            where: { blockerId: userId },
            include: {
                blockedUser: {
                    select: { id: true, fname: true, lname: true },
                },
            },
        });
    }
};
exports.ReviewsService = ReviewsService;
exports.ReviewsService = ReviewsService = ReviewsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ReviewsService);
//# sourceMappingURL=reviews.service.js.map