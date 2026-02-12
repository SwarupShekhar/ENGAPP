import { LivekitService } from './livekit.service';
export declare class LivekitController {
    private livekitService;
    constructor(livekitService: LivekitService);
    getToken(body: {
        userId: string;
        sessionId: string;
    }): Promise<{
        token: string;
        roomName: string;
    }>;
}
