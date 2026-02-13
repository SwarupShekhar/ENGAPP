import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class AzureService {
    private readonly logger = new Logger(AzureService.name);
    private aiEngineUrl: string;

    constructor(
        private configService: ConfigService,
        private httpService: HttpService
    ) {
        this.aiEngineUrl = this.configService.get<string>('AI_ENGINE_URL') || 'http://localhost:8001';
    }

    async analyzeSpeech(audioUrl: string, referenceText: string = ''): Promise<{
        transcript: string;
        pronunciationEvidence: any;
        accuracyScore?: number;
        fluencyScore?: number;
        prosodyScore?: number;
        completenessScore?: number;
        wordCount?: number;
        snr?: number;
    }> {
        try {
            // 1. If no reference text, transcribe first to generate it
            let transcript = referenceText;
            if (!transcript) {
                const transResponse = await lastValueFrom(
                    this.httpService.post(`${this.aiEngineUrl}/api/transcribe`, {
                        audio_url: audioUrl,
                        user_id: "system", // Or pass from caller
                        session_id: "system"
                    })
                );
                transcript = transResponse.data.text;
            }

            // 2. Perform Pronunciation Assessment (invokes Prosody + Azure)
            const pronResponse = await lastValueFrom(
                this.httpService.post(`${this.aiEngineUrl}/api/pronunciation`, {
                    audio_url: audioUrl,
                    reference_text: transcript,
                    user_id: "system"
                })
            );

            const data = pronResponse.data;

            return {
                transcript: transcript,
                pronunciationEvidence: data.words, // Adapting format
                accuracyScore: data.accuracy_score,
                fluencyScore: data.fluency_score,
                prosodyScore: data.prosody_score, // Deep Intelligence!
                completenessScore: data.completeness_score,
                wordCount: transcript.split(/\s+/).filter(w => w.length > 0).length,
                snr: 20 // Placeholder
            };

        } catch (error) {
            this.logger.error(`AI Engine call failed: ${error.message}`);
            // Fallback or rethrow? Rethrow for now to surface issues
            throw error;
        }
    }
}
