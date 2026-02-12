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
import { Logger } from '@nestjs/common';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { ConfigService } from '@nestjs/config';
import { AzureService } from '../azure/azure.service';
import { AzureStorageService } from '../../integrations/azure-storage.service';
import { ClerkService } from '../../integrations/clerk.service';
import { SessionsService } from '../sessions/sessions.service';

@WebSocketGateway({
    cors: { origin: '*' },
    namespace: 'audio',
})
export class RealtimeAudioGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(RealtimeAudioGateway.name);

    // Map socketId -> { pushStream, recognizer, audioBuffer }
    private activeStreams = new Map<string, {
        pushStream: sdk.PushAudioInputStream;
        recognizer: sdk.SpeechRecognizer;
        audioBuffer: Buffer[];
        userId: string;
        sessionId: string;
    }>();

    constructor(
        private configService: ConfigService,
        private azureStorage: AzureStorageService,
        private sessionsService: SessionsService,
        private clerkService: ClerkService,
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
            this.logger.log(`Audio client connected: ${client.id} (User: ${user.id})`);
            client.data.user = user;
        } catch (error) {
            this.logger.error(`Connection failed: ${error.message}`);
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Audio client disconnected: ${client.id}`);
        this.cleanupStream(client.id);
    }

    @SubscribeMessage('startStream')
    async handleStartStream(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { userId: string; sessionId: string; language?: string }
    ) {
        const { userId, sessionId, language = 'en-US' } = payload;

        this.logger.log(`Starting audio stream for user ${userId} in session ${sessionId}`);

        // 1. Setup Azure Speech Config
        const speechKey = this.configService.get<string>('AZURE_SPEECH_KEY');
        const speechRegion = this.configService.get<string>('AZURE_SPEECH_REGION');
        const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
        speechConfig.speechRecognitionLanguage = language;
        speechConfig.outputFormat = sdk.OutputFormat.Detailed;

        // 2. Setup Audio Input Stream
        const pushStream = sdk.AudioInputStream.createPushStream();
        const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

        // 3. Create Recognizer
        const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

        // 4. Setup Events
        recognizer.recognizing = (s, e) => {
            //   this.logger.debug(`Recognizing: ${e.result.text}`);
        };

        recognizer.recognized = (s, e) => {
            if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
                this.logger.log(`Recognized: ${e.result.text}`);
                client.emit('transcription', {
                    text: e.result.text,
                    isFinal: true,
                    timestamp: new Date().toISOString()
                });
            }
        };

        recognizer.canceled = (s, e) => {
            this.logger.warn(`Canceled: ${e.reason} ${e.errorDetails}`);
            this.cleanupStream(client.id);
        };

        recognizer.sessionStopped = (s, e) => {
            this.logger.log('Session stopped.');
            this.cleanupStream(client.id);
        };

        // 5. Start Recognition
        recognizer.startContinuousRecognitionAsync();

        // 6. Store State
        this.activeStreams.set(client.id, {
            pushStream,
            recognizer,
            audioBuffer: [],
            userId,
            sessionId
        });

        return { status: 'started' };
    }

    @SubscribeMessage('audioData')
    handleAudioData(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: any // Expecting ArrayBuffer or Buffer
    ) {
        const stream = this.activeStreams.get(client.id);
        if (stream) {
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

            // 1. Push to Azure
            // Convert Buffer to ArrayBuffer for Azure SDK
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            stream.pushStream.write(arrayBuffer);

            // 2. Buffer in Memory
            stream.audioBuffer.push(buffer);
        }
    }

    @SubscribeMessage('stopStream')
    async handleStopStream(@ConnectedSocket() client: Socket) {
        const stream = this.activeStreams.get(client.id);
        if (stream) {
            this.logger.log(`Stopping stream for user ${stream.userId}`);

            // 1. Stop Azure
            stream.pushStream.close();
            stream.recognizer.stopContinuousRecognitionAsync();

            // 2. Combine Buffer
            const fullAudio = Buffer.concat(stream.audioBuffer);

            // 3. Upload to Azure Blob Storage
            const fileName = `sessions/${stream.sessionId}/${stream.userId}.wav`;
            const blobUrl = await this.azureStorage.uploadFile(fullAudio, fileName, 'audio/wav');

            this.logger.log(`Uploaded audio to ${blobUrl}`);

            this.cleanupStream(client.id);

            return { status: 'stopped', url: blobUrl };
        }
        return { status: 'not_found' };
    }

    private cleanupStream(socketId: string) {
        const stream = this.activeStreams.get(socketId);
        if (stream) {
            stream.pushStream.close();
            try {
                stream.recognizer.close();
            } catch (e) {
                // ignore if already closed
            }
            this.activeStreams.delete(socketId);
        }
    }
}
