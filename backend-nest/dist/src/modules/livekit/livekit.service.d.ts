import { ConfigService } from '@nestjs/config';
export declare class LivekitService {
    private configService;
    private readonly logger;
    constructor(configService: ConfigService);
    generateToken(roomName: string, participantName: string): Promise<string>;
}
