import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class ReviewsService {
    private readonly logger = new Logger(ReviewsService.name);

    constructor(private prisma: PrismaService) { }

    async submitReview(data: { sessionId: string; reviewerId: string; revieweeId: string; rating: number; comment?: string }) {
        try {
            // Verify session participants
            const participants = await this.prisma.sessionParticipant.findMany({
                where: { sessionId: data.sessionId },
                select: { userId: true },
            });

            const userIds = participants.map(p => p.userId);
            if (!userIds.includes(data.reviewerId) || !userIds.includes(data.revieweeId)) {
                throw new BadRequestException('Invalid session participants for review');
            }

            if (data.reviewerId === data.revieweeId) {
                throw new BadRequestException('You cannot review yourself');
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
        } catch (error) {
            this.logger.error(`Failed to submit review: ${error.message}`);
            throw error;
        }
    }

    async getReviewsReceived(userId: string) {
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

    async blockUser(blockerId: string, blockedUserId: string) {
        if (blockerId === blockedUserId) {
            throw new BadRequestException('You cannot block yourself');
        }

        try {
            return await this.prisma.blockedUser.upsert({
                where: {
                    blockerId_blockedUserId: { blockerId, blockedUserId },
                },
                update: {}, // No update needed if already exists
                create: {
                    blockerId,
                    blockedUserId,
                },
            });
        } catch (error) {
            this.logger.error(`Failed to block user: ${error.message}`);
            throw error;
        }
    }

    async getBlockedUsers(userId: string) {
        return this.prisma.blockedUser.findMany({
            where: { blockerId: userId },
            include: {
                blockedUser: {
                    select: { id: true, fname: true, lname: true },
                },
            },
        });
    }
}
