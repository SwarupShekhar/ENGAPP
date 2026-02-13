import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
export declare class BrainService {
    private configService;
    private httpService;
    private readonly logger;
    private aiEngineUrl;
    constructor(configService: ConfigService, httpService: HttpService);
    analyzeImageDescription(transcript: string, imageLevel: string, imageDescription: string): Promise<{
        grammarScore: number;
        vocabularyCEFR: any;
        relevanceScore: number;
        talkStyle: string;
    }>;
    private ruleBasedFallback;
    interpretAzureEvidence(transcript: string, evidence: any): Promise<{
        corrected: any;
        explanation: any;
        severity: string;
        pronunciationTip: any;
        mistakes: any;
        original?: undefined;
    } | {
        original: string;
        corrected: string;
        explanation: string;
        severity: string;
        pronunciationTip: string;
        mistakes: any[];
    }>;
}
