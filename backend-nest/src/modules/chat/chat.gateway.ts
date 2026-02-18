import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ClerkService } from '../../integrations/clerk.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ChatService } from './chat.service';

interface AuthenticatedSocket extends Socket {
    userId?: string;
    userName?: string;
}

@WebSocketGateway({
    cors: {
        origin: '*',
        credentials: true,
    },
    namespace: '/chat',
    transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(ChatGateway.name);

    // userId → Set of socketIds (supports multi-device)
    private onlineUsers = new Map<string, Set<string>>();

    constructor(
        private clerkService: ClerkService,
        private prisma: PrismaService,
        private chatService: ChatService,
    ) {}

    // ── Connection ──────────────────────────────────────
    async handleConnection(client: AuthenticatedSocket) {
        try {
            const token = client.handshake.auth?.token as string;
            if (!token) {
                throw new Error('No token provided');
            }

            // Verify using Clerk (same as existing auth pattern)
            const session = await this.clerkService.verifyToken(token);
            if (!session) {
                throw new Error('Invalid token');
            }

            // Resolve internal user from clerkId
            const user = await this.prisma.user.findUnique({
                where: { clerkId: session.userId },
                select: { id: true, fname: true, lname: true },
            });

            if (!user) {
                throw new Error('User not found in database');
            }

            client.userId = user.id;
            client.userName = `${user.fname} ${user.lname}`.trim();

            // Track online users (multi-device)
            if (!this.onlineUsers.has(user.id)) {
                this.onlineUsers.set(user.id, new Set());
            }
            this.onlineUsers.get(user.id)!.add(client.id);

            // Join personal room for direct notifications
            client.join(`user:${user.id}`);

            // Broadcast presence
            this.broadcastPresence(user.id, 'online');

            this.logger.log(`[Socket] User ${user.id} (${client.userName}) connected — socket: ${client.id}`);
        } catch (error) {
            this.logger.warn(`Connection failed: ${error.message}`);
            client.disconnect(true);
        }
    }

    handleDisconnect(client: AuthenticatedSocket) {
        if (!client.userId) return;

        const userSockets = this.onlineUsers.get(client.userId);
        if (userSockets) {
            userSockets.delete(client.id);
            if (userSockets.size === 0) {
                this.onlineUsers.delete(client.userId);
                this.broadcastPresence(client.userId, 'offline');
            }
        }

        this.logger.log(`User ${client.userId} disconnected`);
    }

    // ── Join conversation room ──────────────────────────
    @SubscribeMessage('join_conversation')
    handleJoinConversation(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { conversationId: string },
    ) {
        client.join(`conversation:${data.conversationId}`);
        this.logger.log(`User ${client.userId} joined conversation ${data.conversationId}`);
        return { success: true };
    }

    // ── Send message ────────────────────────────────────
    @SubscribeMessage('send_message')
    async handleSendMessage(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: {
            conversationId: string;
            content: string;
            type?: string;
            metadata?: any;
        },
    ) {
        try {
            const message = await this.chatService.saveMessage(
                data.conversationId,
                client.userId!,
                data.content,
                data.type || 'text',
                data.metadata,
            );

            // Broadcast to everyone in this conversation room
            this.server.to(`conversation:${data.conversationId}`).emit('new_message', {
                conversationId: data.conversationId,
                message,
            });

            return { success: true, messageId: message.id };
        } catch (err) {
            this.logger.error(`send_message error: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // ── Typing indicators ───────────────────────────────
    @SubscribeMessage('typing_start')
    handleTypingStart(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { conversationId: string },
    ) {
        client.to(`conversation:${data.conversationId}`).emit('user_typing', {
            conversationId: data.conversationId,
            userId: client.userId,
            userName: client.userName,
            isTyping: true,
        });
    }

    @SubscribeMessage('typing_stop')
    handleTypingStop(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { conversationId: string },
    ) {
        client.to(`conversation:${data.conversationId}`).emit('user_typing', {
            conversationId: data.conversationId,
            userId: client.userId,
            isTyping: false,
        });
    }

    // ── Mark as read ────────────────────────────────────
    @SubscribeMessage('mark_read')
    async handleMarkRead(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { conversationId: string },
    ) {
        await this.chatService.markAsRead(data.conversationId, client.userId!);

        // Notify conversation members
        client.to(`conversation:${data.conversationId}`).emit('messages_read', {
            conversationId: data.conversationId,
            readByUserId: client.userId,
            readAt: new Date().toISOString(),
        });

        return { success: true };
    }

    // ── Call invite ─────────────────────────────────────
    @SubscribeMessage('send_call_invite')
    async handleCallInvite(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: {
            conversationId: string;
            callId: string;
            callType: 'voice' | 'video';
        },
    ) {
        // Save call invite as a message
        const message = await this.chatService.saveMessage(
            data.conversationId,
            client.userId!,
            `📞 ${client.userName} started a ${data.callType} call`,
            'call_invite',
            {
                callId: data.callId,
                callType: data.callType,
                status: 'pending',
                initiatorId: client.userId,
                initiatorName: client.userName,
            },
        );

        // Broadcast to conversation
        this.server.to(`conversation:${data.conversationId}`).emit('new_message', {
            conversationId: data.conversationId,
            message,
        });

        // Find other participants to send a direct incoming call signal
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: data.conversationId },
            include: { participants: true },
        });

        if (conversation) {
            conversation.participants.forEach(p => {
                if (p.userId !== client.userId) {
                    this.logger.log(`[DirectCall] Notifying user ${p.userId} of incoming call from ${client.userId}`);
                    this.notifyUser(p.userId, 'incoming_call', {
                        conversationId: data.conversationId,
                        initiatorId: client.userId,
                        initiatorName: client.userName,
                        callType: data.callType,
                        sessionId: data.conversationId,
                    });
                }
            });
        }

        return { success: true, messageId: message.id };
    }

    @SubscribeMessage('accept_call')
    async handleAcceptCall(client: AuthenticatedSocket, data: { conversationId: string }) {
        this.logger.log(`[DirectCall] User ${client.userId} accepted call in ${data.conversationId}`);
        // Notify other participants in the conversation that the call was accepted
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: data.conversationId },
            include: { participants: true },
        });

        if (conversation) {
            conversation.participants.forEach(p => {
                if (p.userId !== client.userId) {
                    this.notifyUser(p.userId, 'call_status_update', {
                        conversationId: data.conversationId,
                        status: 'accepted',
                        responderId: client.userId,
                    });
                }
            });
        }
    }

    @SubscribeMessage('decline_call')
    async handleDeclineCall(client: AuthenticatedSocket, data: { conversationId: string }) {
        this.logger.log(`[DirectCall] User ${client.userId} declined call in ${data.conversationId}`);
        // Notify other participants in the conversation that the call was declined
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: data.conversationId },
            include: { participants: true },
        });

        if (conversation) {
            conversation.participants.forEach(p => {
                if (p.userId !== client.userId) {
                    this.notifyUser(p.userId, 'call_status_update', {
                        conversationId: data.conversationId,
                        status: 'declined',
                        responderId: client.userId,
                    });
                }
            });
        }
    }

    // ── Presence Sync ──────────────────────────────────
    @SubscribeMessage('get_online_users')
    handleGetOnlineUsers() {
        const ids = Array.from(this.onlineUsers.keys());
        this.logger.log(`[Socket] get_online_users request. Current online count: ${ids.length}`);
        return { 
            success: true, 
            onlineUserIds: ids
        };
    }

    // ── Helpers ─────────────────────────────────────────
    private broadcastPresence(userId: string, status: 'online' | 'offline') {
        this.server.emit('presence_update', {
            userId,
            status,
            lastSeen: new Date().toISOString(),
        });
    }

    isUserOnline(userId: string): boolean {
        return this.onlineUsers.has(userId) && this.onlineUsers.get(userId)!.size > 0;
    }

    notifyUser(userId: string, event: string, data: any) {
        this.server.to(`user:${userId}`).emit(event, data);
    }
}
