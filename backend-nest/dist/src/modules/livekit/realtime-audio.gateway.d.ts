import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { AzureStorageService } from '../../integrations/azure-storage.service';
import { ClerkService } from '../../integrations/clerk.service';
import { SessionsService } from '../sessions/sessions.service';
export declare class RealtimeAudioGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private configService;
    private azureStorage;
    private sessionsService;
    private clerkService;
    server: Server;
    private readonly logger;
    private activeStreams;
    constructor(configService: ConfigService, azureStorage: AzureStorageService, sessionsService: SessionsService, clerkService: ClerkService);
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): void;
    handleStartStream(client: Socket, payload: {
        userId: string;
        sessionId: string;
        language?: string;
    }): Promise<{
        status: string;
    }>;
    handleAudioData(client: Socket, data: any): void;
    handleStopStream(client: Socket): Promise<{
        status: string;
        url: string;
    } | {
        status: string;
        url?: undefined;
    }>;
    private cleanupStream;
}
