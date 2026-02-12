import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class FriendshipService {
    constructor(private prisma: PrismaService) { }

    async sendRequest(requesterId: string, addresseeClerkIdOrEmail: string) {
        // 1. Find the user by Clerk ID
        const addressee = await this.prisma.user.findFirst({
            where: {
                clerkId: addresseeClerkIdOrEmail
            }
        });

        if (!addressee) {
            throw new NotFoundException('User not found');
        }

        return this.sendRequestById(requesterId, addressee.id);
    }

    async sendRequestById(requesterId: string, addresseeId: string) {
        if (requesterId === addresseeId) {
            throw new BadRequestException('Cannot add yourself');
        }

        // Check for existing friendship
        const existingFriendship = await this.prisma.friendship.findFirst({
            where: {
                OR: [
                    { requesterId, addresseeId },
                    { requesterId: addresseeId, addresseeId: requesterId },
                ],
            },
        });

        if (existingFriendship) {
            throw new BadRequestException('Friendship request already exists or you are already friends');
        }

        // Check for existing friend request
        const existingRequest = await this.prisma.friendRequest.findFirst({
            where: {
                OR: [
                    { senderId: requesterId, receiverId: addresseeId },
                    { senderId: addresseeId, receiverId: requesterId }
                ]
            }
        });

        if (existingRequest) {
            throw new BadRequestException('Friend request already pending');
        }

        // Create FriendRequest
        return this.prisma.friendRequest.create({
            data: {
                senderId: requesterId,
                receiverId: addresseeId,
                status: 'PENDING',
            },
        });
    }

    async acceptRequest(userId: string, requestId: string) {
        const request = await this.prisma.friendRequest.findUnique({
            where: { id: requestId },
        });

        if (!request) throw new NotFoundException('Friend request not found');
        if (request.receiverId !== userId) {
            throw new BadRequestException('You can only accept requests sent to you');
        }

        if (request.status !== 'PENDING') {
            throw new BadRequestException('Request is already ' + request.status);
        }

        // Transaction to update request and create friendship
        const [updatedRequest, friendship] = await this.prisma.$transaction([
            this.prisma.friendRequest.update({
                where: { id: requestId },
                data: { status: 'ACCEPTED' },
            }),
            this.prisma.friendship.create({
                data: {
                    requesterId: request.senderId,
                    addresseeId: request.receiverId,
                    status: 'ACCEPTED',
                },
            }),
        ]);

        return friendship;
    }

    async rejectRequest(userId: string, requestId: string) {
        const request = await this.prisma.friendRequest.findUnique({
            where: { id: requestId },
        });

        if (!request) throw new NotFoundException('Friend request not found');
        if (request.receiverId !== userId) {
            throw new BadRequestException('You can only reject requests sent to you');
        }

        return this.prisma.friendRequest.update({
            where: { id: requestId },
            data: { status: 'REJECTED' },
        });
    }

    async getFriends(userId: string) {
        return this.prisma.friendship.findMany({
            where: {
                OR: [
                    { requesterId: userId, status: 'ACCEPTED' },
                    { addresseeId: userId, status: 'ACCEPTED' },
                ],
            },
            include: {
                requester: true,
                addressee: true,
            },
        });
    }

    async getPendingRequests(userId: string) {
        return this.prisma.friendRequest.findMany({
            where: {
                receiverId: userId,
                status: 'PENDING',
            },
            include: {
                sender: true,
            },
        });
    }

    async areFriends(userAId: string, userBId: string): Promise<boolean> {
        const friendship = await this.prisma.friendship.findFirst({
            where: {
                OR: [
                    { requesterId: userAId, addresseeId: userBId, status: 'ACCEPTED' },
                    { requesterId: userBId, addresseeId: userAId, status: 'ACCEPTED' }
                ]
            }
        });
        return !!friendship;
    }
}
