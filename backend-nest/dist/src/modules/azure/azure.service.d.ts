import { ConfigService } from '@nestjs/config';
export declare class AzureService {
    private configService;
    constructor(configService: ConfigService);
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
