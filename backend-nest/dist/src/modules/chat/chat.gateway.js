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
var ChatGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const friendship_service_1 = require("../friendship/friendship.service");
const clerk_service_1 = require("../../integrations/clerk.service");
const prisma_service_1 = require("../../database/prisma/prisma.service");
let ChatGateway = ChatGateway_1 = class ChatGateway {
    constructor(friendshipService, clerkService, prisma) {
        this.friendshipService = friendshipService;
        this.clerkService = clerkService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(ChatGateway_1.name);
        this.connectedUsers = new Map();
    }
    async handleConnection(client) {
        try {
            const token = client.handshake.auth.token;
            if (!token) {
                throw new Error('No token provided');
            }
            const user = await this.clerkService.verifyToken(token);
            if (!user) {
                throw new Error('Invalid token');
            }
            this.connectedUsers.set(user.id, client.id);
            client.data.user = user;
            this.logger.log(`User connected: ${user.id}`);
            client.join(`user:${user.id}`);
            const offlineMessages = await this.prisma.chatMessage.findMany({
                where: {
                    receiverId: user.id,
                    read: false,
                },
                orderBy: { createdAt: 'asc' },
            });
            if (offlineMessages.length > 0) {
                offlineMessages.forEach(msg => {
                    client.emit('chat:receive', {
                        from: msg.senderId,
                        message: msg.content,
                        timestamp: msg.createdAt,
                        id: msg.id
                    });
                });
            }
        }
        catch (error) {
            this.logger.error(`Connection failed: ${error.message}`);
            client.disconnect();
        }
    }
    handleDisconnect(client) {
        if (client.data.user) {
            this.connectedUsers.delete(client.data.user.id);
            this.logger.log(`User disconnected: ${client.data.user.id}`);
        }
    }
    async handleMessage(client, payload) {
        const senderId = client.data.user.id;
        const { toUserId, message } = payload;
        const areFriends = await this.friendshipService.areFriends(senderId, toUserId);
        if (!areFriends) {
            this.logger.warn(`User ${senderId} tried to message ${toUserId} without friendship`);
            client.emit('chat:error', { message: 'Not in network' });
            return;
        }
        const savedMessage = await this.prisma.chatMessage.create({
            data: {
                senderId,
                receiverId: toUserId,
                content: message,
                read: false,
            }
        });
        this.server.to(`user:${toUserId}`).emit('chat:receive', {
            from: senderId,
            message,
            timestamp: savedMessage.createdAt,
            id: savedMessage.id
        });
    }
    async handleTyping(client, payload) {
        const senderId = client.data.user.id;
        this.server.to(`user:${payload.toUserId}`).emit('chat:typing', { from: senderId });
    }
    async handleReadReceipt(client, payload) {
        try {
            const msg = await this.prisma.chatMessage.update({
                where: { id: payload.messageId },
                data: { read: true }
            });
            if (msg) {
                this.server.to(`user:${msg.senderId}`).emit('chat:read', { messageId: payload.messageId });
            }
        }
        catch (e) {
        }
    }
};
exports.ChatGateway = ChatGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], ChatGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('chat:send'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleMessage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('chat:typing'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleTyping", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('chat:read'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleReadReceipt", null);
exports.ChatGateway = ChatGateway = ChatGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    }),
    __metadata("design:paramtypes", [friendship_service_1.FriendshipService,
        clerk_service_1.ClerkService,
        prisma_service_1.PrismaService])
], ChatGateway);
//# sourceMappingURL=chat.gateway.js.map