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
var RealtimeAudioGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeAudioGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const sdk = require("microsoft-cognitiveservices-speech-sdk");
const config_1 = require("@nestjs/config");
const azure_storage_service_1 = require("../../integrations/azure-storage.service");
const clerk_service_1 = require("../../integrations/clerk.service");
const sessions_service_1 = require("../sessions/sessions.service");
let RealtimeAudioGateway = RealtimeAudioGateway_1 = class RealtimeAudioGateway {
    constructor(configService, azureStorage, sessionsService, clerkService) {
        this.configService = configService;
        this.azureStorage = azureStorage;
        this.sessionsService = sessionsService;
        this.clerkService = clerkService;
        this.logger = new common_1.Logger(RealtimeAudioGateway_1.name);
        this.activeStreams = new Map();
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
            this.logger.log(`Audio client connected: ${client.id} (User: ${user.id})`);
            client.data.user = user;
        }
        catch (error) {
            this.logger.error(`Connection failed: ${error.message}`);
            client.disconnect();
        }
    }
    handleDisconnect(client) {
        this.logger.log(`Audio client disconnected: ${client.id}`);
        this.cleanupStream(client.id);
    }
    async handleStartStream(client, payload) {
        const { userId, sessionId, language = 'en-US' } = payload;
        this.logger.log(`Starting audio stream for user ${userId} in session ${sessionId}`);
        const speechKey = this.configService.get('AZURE_SPEECH_KEY');
        const speechRegion = this.configService.get('AZURE_SPEECH_REGION');
        const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
        speechConfig.speechRecognitionLanguage = language;
        speechConfig.outputFormat = sdk.OutputFormat.Detailed;
        const pushStream = sdk.AudioInputStream.createPushStream();
        const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
        const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
        recognizer.recognizing = (s, e) => {
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
        recognizer.startContinuousRecognitionAsync();
        this.activeStreams.set(client.id, {
            pushStream,
            recognizer,
            audioBuffer: [],
            userId,
            sessionId
        });
        return { status: 'started' };
    }
    handleAudioData(client, data) {
        const stream = this.activeStreams.get(client.id);
        if (stream) {
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
            const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
            stream.pushStream.write(arrayBuffer);
            stream.audioBuffer.push(buffer);
        }
    }
    async handleStopStream(client) {
        const stream = this.activeStreams.get(client.id);
        if (stream) {
            this.logger.log(`Stopping stream for user ${stream.userId}`);
            stream.pushStream.close();
            stream.recognizer.stopContinuousRecognitionAsync();
            const fullAudio = Buffer.concat(stream.audioBuffer);
            const fileName = `sessions/${stream.sessionId}/${stream.userId}.wav`;
            const blobUrl = await this.azureStorage.uploadFile(fullAudio, fileName, 'audio/wav');
            this.logger.log(`Uploaded audio to ${blobUrl}`);
            this.cleanupStream(client.id);
            return { status: 'stopped', url: blobUrl };
        }
        return { status: 'not_found' };
    }
    cleanupStream(socketId) {
        const stream = this.activeStreams.get(socketId);
        if (stream) {
            stream.pushStream.close();
            try {
                stream.recognizer.close();
            }
            catch (e) {
            }
            this.activeStreams.delete(socketId);
        }
    }
};
exports.RealtimeAudioGateway = RealtimeAudioGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RealtimeAudioGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('startStream'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RealtimeAudioGateway.prototype, "handleStartStream", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('audioData'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], RealtimeAudioGateway.prototype, "handleAudioData", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('stopStream'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], RealtimeAudioGateway.prototype, "handleStopStream", null);
exports.RealtimeAudioGateway = RealtimeAudioGateway = RealtimeAudioGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: { origin: '*' },
        namespace: 'audio',
    }),
    __metadata("design:paramtypes", [config_1.ConfigService,
        azure_storage_service_1.AzureStorageService,
        sessions_service_1.SessionsService,
        clerk_service_1.ClerkService])
], RealtimeAudioGateway);
//# sourceMappingURL=realtime-audio.gateway.js.map