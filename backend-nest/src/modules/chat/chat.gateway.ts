import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { FriendshipService } from '../friendship/friendship.service';
import { ClerkService } from '../../integrations/clerk.service';
import { PrismaService } from '../../database/prisma/prisma.service';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(ChatGateway.name);
    private connectedUsers = new Map<string, string>(); // userId -> socketId

    constructor(
        private friendshipService: FriendshipService,
        private clerkService: ClerkService,
        private prisma: PrismaService,
    ) { }

    async handleConnection(client: Socket) {
        try {
            // 1) Verify Auth
            const token = client.handshake.auth.token as string;
            if (!token) {
                throw new Error('No token provided');
            }

            // Verify JWT using Clerk
            const user = await this.clerkService.verifyToken(token);
            if (!user) {
                throw new Error('Invalid token');
            }

            // 2) Store Connection
            this.connectedUsers.set(user.id, client.id);
            client.data.user = user;

            this.logger.log(`User connected: ${user.id}`);

            // 3) Join User Room
            client.join(`user:${user.id}`);

            // 4) Deliver Offline Messages
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
        } catch (error) {
            this.logger.error(`Connection failed: ${error.message}`);
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        if (client.data.user) {
            this.connectedUsers.delete(client.data.user.id);
            this.logger.log(`User disconnected: ${client.data.user.id}`);
        }
    }

    @SubscribeMessage('chat:send')
    async handleMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { toUserId: string; message: string },
    ) {
        const senderId = client.data.user.id;
        const { toUserId, message } = payload;

        // 1) Check Friendship
        const areFriends = await this.friendshipService.areFriends(senderId, toUserId);
        if (!areFriends) {
            this.logger.warn(`User ${senderId} tried to message ${toUserId} without friendship`);
            client.emit('chat:error', { message: 'Not in network' });
            return;
        }

        // 2) Store in DB
        const savedMessage = await this.prisma.chatMessage.create({
            data: {
                senderId,
                receiverId: toUserId,
                content: message,
                read: false,
            }
        });

        // 3) Send to Recipient (via room)
        this.server.to(`user:${toUserId}`).emit('chat:receive', {
            from: senderId,
            message,
            timestamp: savedMessage.createdAt,
            id: savedMessage.id
        });
    }

    @SubscribeMessage('chat:typing')
    async handleTyping(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { toUserId: string },
    ) {
        const senderId = client.data.user.id;
        this.server.to(`user:${payload.toUserId}`).emit('chat:typing', { from: senderId });
    }

    @SubscribeMessage('chat:read')
    async handleReadReceipt(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { messageId: string },
    ) {
        // Update DB
        try {
            const msg = await this.prisma.chatMessage.update({
                where: { id: payload.messageId },
                data: { read: true }
            });

            // Notify Sender
            if (msg) {
                this.server.to(`user:${msg.senderId}`).emit('chat:read', { messageId: payload.messageId });
            }
        } catch (e) {
            // Handle error (e.g. message not found)
        }
    }
}
