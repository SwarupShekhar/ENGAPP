import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';

@Injectable()
export class LivekitService {
    private readonly logger = new Logger(LivekitService.name);

    constructor(private configService: ConfigService) { }

    async generateToken(roomName: string, participantName: string) {
        try {
            const apiKey = this.configService.get<string>('livekit.apiKey');
            const apiSecret = this.configService.get<string>('livekit.apiSecret');

            const at = new AccessToken(apiKey, apiSecret, {
                identity: participantName,
            });

            at.addGrant({
                roomJoin: true,
                room: roomName,
                canPublish: true,
                canSubscribe: true,
            });

            return at.toJwt();
        } catch (error) {
            this.logger.error(`Failed to generate LiveKit token: ${error.message}`);
            throw error;
        }
    }
}
