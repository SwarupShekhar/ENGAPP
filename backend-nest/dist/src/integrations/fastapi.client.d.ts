import { ConfigService } from '@nestjs/config';
export declare class FastApiClient {
    private configService;
    private readonly logger;
    private readonly baseUrl;
    constructor(configService: ConfigService);
    transcribe(audioUrl: string, sessionId: string): Promise<any>;
    analyze(transcript: string, sessionId: string, userId: string): Promise<any>;
}
