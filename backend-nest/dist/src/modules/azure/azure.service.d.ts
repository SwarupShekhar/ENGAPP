import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
export declare class AzureService {
    private configService;
    private httpService;
    private readonly logger;
    private aiEngineUrl;
    constructor(configService: ConfigService, httpService: HttpService);
    analyzeSpeech(audioUrl: string, referenceText?: string): Promise<{
        transcript: string;
        pronunciationEvidence: any;
        accuracyScore?: number;
        fluencyScore?: number;
        prosodyScore?: number;
        completenessScore?: number;
        wordCount?: number;
        snr?: number;
    }>;
}
