import { ConfigService } from '@nestjs/config';
export declare class BrainService {
    private configService;
    private genAI;
    private model;
    constructor(configService: ConfigService);
    analyzeImageDescription(transcript: string, imageLevel: string, imageDescription: string): Promise<any>;
    private ruleBasedFallback;
    interpretAzureEvidence(transcript: string, evidence: any): Promise<any>;
}
