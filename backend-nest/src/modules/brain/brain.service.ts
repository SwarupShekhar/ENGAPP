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
            // Build structured context with labeled Azure pronunciation data
            const azureContext = this.formatAzureEvidence(evidence);

            const response = await lastValueFrom(
                this.httpService.post(`${this.aiEngineUrl}/api/analyze`, {
                    text: transcript,
                    user_id: "system",
                    session_id: "system",
                    context: azureContext
                })
            );

            const data = response.data.data;

            // Map backend-ai errors to mistake format
            const mistakes = (data.errors || []).map(e => ({
                original: e.original_text,
                corrected: e.corrected_text,
                type: e.type,
                explanation: e.explanation,
                severity: e.severity?.toLowerCase() || 'medium',
            }));

            // Extract AI-generated scores — use correct field names from Gemini response
            const aiScores = data.metrics || {};

            return {
                corrected: mistakes.length > 0 ? mistakes[0].corrected : transcript,
                explanation: data.feedback || "No feedback available.",
                severity: mistakes.length > 3 ? "high" : mistakes.length > 0 ? "medium" : "low",
                pronunciationTip: (data.improvement_areas || [])[0] || "Keep practicing!",
                mistakes: mistakes,
                scores: {
                    grammar: aiScores.grammar_score ?? 50,
                    pronunciation: aiScores.pronunciation_score ?? 50,
                    fluency: aiScores.fluency_score ?? 50,
                    vocabulary: aiScores.vocabulary_score ?? 50,
                    overall: aiScores.overall_score ?? 50,
                },
                feedback: data.feedback || '',
                strengths: data.strengths || [],
                improvementAreas: data.improvement_areas || [],
                cefrLevel: data.cefr_assessment?.level || 'B1',
                accentNotes: data.improvement_areas?.find((a: string) => a.toLowerCase().includes('accent') || a.toLowerCase().includes('pronunciation')) || null,
            };

        } catch (error) {
            this.logger.error("BrainService Interpret Error:", error);
            return {
                original: transcript,
                corrected: transcript,
                explanation: "AI service temporarily unavailable.",
                severity: "low",
                pronunciationTip: "Keep practicing!",
                mistakes: [],
                scores: { grammar: 0, pronunciation: 0, fluency: 0, vocabulary: 0, overall: 0 },
                strengths: [],
                improvementAreas: [],
                cefrLevel: 'N/A',
            };
        }
    }

    /**
     * Format raw Azure pronunciation evidence into a structured, labeled string
     * that Gemini can understand and use for scoring.
     */
    private formatAzureEvidence(evidence: any): string {
        if (!evidence) return '';

        // If evidence is an array of word-level pronunciation data
        if (Array.isArray(evidence)) {
            const wordSummaries = evidence.slice(0, 20).map((w: any) =>
                `"${w.word || w.Word}" (accuracy: ${w.accuracyScore ?? w.AccuracyScore ?? 'N/A'}%, error: ${w.errorType || w.ErrorType || 'None'})`
            ).join(', ');

            return `Azure Speech Pronunciation Assessment Results:
- Words analyzed: ${evidence.length}
- Per-word accuracy: [${wordSummaries}]
Use these accuracy scores to inform your pronunciation_score. Words with low accuracy or error types like "Mispronunciation" should lower the score.`;
        }

        // If evidence is an object with aggregate scores
        if (typeof evidence === 'object') {
            return `Azure Speech Pronunciation Assessment Results:
- Accuracy Score: ${evidence.accuracyScore ?? 'N/A'}/100
- Fluency Score: ${evidence.fluencyScore ?? 'N/A'}/100
- Prosody Score: ${evidence.prosodyScore ?? 'N/A'}/100
- Completeness Score: ${evidence.completenessScore ?? 'N/A'}/100
Use these scores to calibrate your pronunciation_score and fluency_score.`;
        }

        return `Azure Evidence: ${JSON.stringify(evidence).substring(0, 500)}`;
    }

    async analyzeJoint(sessionId: string, segments: any[]) {
        try {
            const response = await lastValueFrom(
                this.httpService.post(`${this.aiEngineUrl}/api/analyze-joint`, {
                    session_id: sessionId,
                    segments: segments
                })
            );

            return response.data;
        } catch (error) {
            this.logger.error("BrainService Joint Analysis Error:", error);
            throw error;
        }
    }
}
