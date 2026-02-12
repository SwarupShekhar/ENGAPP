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
exports.FriendshipService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma/prisma.service");
let FriendshipService = class FriendshipService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async sendRequest(requesterId, addresseeClerkIdOrEmail) {
        const addressee = await this.prisma.user.findFirst({
            where: {
                clerkId: addresseeClerkIdOrEmail
            }
        });
        if (!addressee) {
            throw new common_1.NotFoundException('User not found');
        }
        return this.sendRequestById(requesterId, addressee.id);
    }
    async sendRequestById(requesterId, addresseeId) {
        if (requesterId === addresseeId) {
            throw new common_1.BadRequestException('Cannot add yourself');
        }
        const existingFriendship = await this.prisma.friendship.findFirst({
            where: {
                OR: [
                    { requesterId, addresseeId },
                    { requesterId: addresseeId, addresseeId: requesterId },
                ],
            },
        });
        if (existingFriendship) {
            throw new common_1.BadRequestException('Friendship request already exists or you are already friends');
        }
        const existingRequest = await this.prisma.friendRequest.findFirst({
            where: {
                OR: [
                    { senderId: requesterId, receiverId: addresseeId },
                    { senderId: addresseeId, receiverId: requesterId }
                ]
            }
        });
        if (existingRequest) {
            throw new common_1.BadRequestException('Friend request already pending');
        }
        return this.prisma.friendRequest.create({
            data: {
                senderId: requesterId,
                receiverId: addresseeId,
                status: 'PENDING',
            },
        });
    }
    async acceptRequest(userId, requestId) {
        const request = await this.prisma.friendRequest.findUnique({
            where: { id: requestId },
        });
        if (!request)
            throw new common_1.NotFoundException('Friend request not found');
        if (request.receiverId !== userId) {
            throw new common_1.BadRequestException('You can only accept requests sent to you');
        }
        if (request.status !== 'PENDING') {
            throw new common_1.BadRequestException('Request is already ' + request.status);
        }
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
    async rejectRequest(userId, requestId) {
        const request = await this.prisma.friendRequest.findUnique({
            where: { id: requestId },
        });
        if (!request)
            throw new common_1.NotFoundException('Friend request not found');
        if (request.receiverId !== userId) {
            throw new common_1.BadRequestException('You can only reject requests sent to you');
        }
        return this.prisma.friendRequest.update({
            where: { id: requestId },
            data: { status: 'REJECTED' },
        });
    }
    async getFriends(userId) {
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
    async getPendingRequests(userId) {
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
    async areFriends(userAId, userBId) {
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
};
exports.FriendshipService = FriendshipService;
exports.FriendshipService = FriendshipService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FriendshipService);
//# sourceMappingURL=friendship.service.js.map