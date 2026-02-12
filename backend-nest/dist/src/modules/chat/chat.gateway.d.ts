import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { FriendshipService } from '../friendship/friendship.service';
import { ClerkService } from '../../integrations/clerk.service';
import { PrismaService } from '../../database/prisma/prisma.service';
export declare class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private friendshipService;
    private clerkService;
    private prisma;
    server: Server;
    private readonly logger;
    private connectedUsers;
    constructor(friendshipService: FriendshipService, clerkService: ClerkService, prisma: PrismaService);
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): void;
    handleMessage(client: Socket, payload: {
        toUserId: string;
        message: string;
    }): Promise<void>;
    handleTyping(client: Socket, payload: {
        toUserId: string;
    }): Promise<void>;
    handleReadReceipt(client: Socket, payload: {
        messageId: string;
    }): Promise<void>;
}
