import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class BrainService {
    private readonly logger = new Logger(BrainService.name);
    private aiEngineUrl: string;

    constructor(
        private configService: ConfigService,
        private httpService: HttpService
    ) {
        this.aiEngineUrl = this.configService.get<string>('AI_ENGINE_URL') || 'http://localhost:8001';
    }

    async analyzeImageDescription(transcript: string, imageLevel: string, imageDescription: string) {
        try {
            // We reuse the generic analyze endpoint but pass specific context
            const response = await lastValueFrom(
                this.httpService.post(`${this.aiEngineUrl}/api/analyze`, {
                    text: transcript,
                    user_id: "system", // Should ideally be passed down
                    session_id: "system",
                    context: `Assessment Phase 3. Image Level: ${imageLevel}. Image Description: ${imageDescription}. Require relevance score and talk style.`
                })
            );

            const data = response.data.data;

            // Map generic response to required format
            // If backend-ai doesn't return exactly what we need, we fallback or derive
            // For now, mapping best effort based on standard AnalysisResponse

            return {
                grammarScore: data.metrics.grammar_score * 10, // Scale 0-10 to 0-100
                vocabularyCEFR: data.cefr_assessment.level,
                relevanceScore: 80, // backend-ai doesn't calculate this yet, mocking
                talkStyle: "PASSENGER" // backend-ai doesn't calculate this yet, mocking
            };

        } catch (error) {
            this.logger.error("BrainService Phase 3 Error:", error);
            // Verify ruleBasedFallback exists or implement it here
            return this.ruleBasedFallback(transcript);
        }
    }

    private ruleBasedFallback(transcript: string) {
        const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;
        return {
            grammarScore: 70,
            vocabularyCEFR: wordCount > 20 ? "B1" : "A2",
            relevanceScore: 75,
            talkStyle: wordCount > 30 ? "DRIVER" : "PASSENGER"
        };
    }

    async interpretAzureEvidence(transcript: string, evidence: any) {
        try {
            const response = await lastValueFrom(
                this.httpService.post(`${this.aiEngineUrl}/api/analyze`, {
                    text: transcript,
                    user_id: "system",
                    session_id: "system",
                    context: `Interpret Azure Evidence: ${JSON.stringify(evidence)}`
                })
            );

            const data = response.data.data;

            // Map backend-ai errors to mistake format
            const mistakes = data.errors.map(e => ({
                original: e.original_text,
                corrected: e.corrected_text,
                type: e.type,
                explanation: e.explanation
            }));

            return {
                corrected: mistakes.length > 0 ? mistakes[0].corrected : transcript, // Simplified
                explanation: data.feedback,
                severity: "medium",
                pronunciationTip: data.improvement_areas[0] || "Keep practicing!",
                mistakes: mistakes
            };

        } catch (error) {
            this.logger.error("BrainService Interpret Error:", error);
            return {
                original: transcript,
                corrected: transcript,
                explanation: "AI service temporarily unavailable.",
                severity: "low",
                pronunciationTip: "Keep practicing!",
                mistakes: []
            };
        }
    }
}
