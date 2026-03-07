import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Interval } from '@nestjs/schedule';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class BrainService implements OnModuleInit {
  private readonly logger = new Logger(BrainService.name);
  private aiEngineUrl: string;
  private aiEngineHealthy = false;
  private lastHealthCheck: Date | null = null;
  private consecutiveFailures = 0;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.aiEngineUrl =
      this.configService.get<string>('AI_ENGINE_URL') ||
      'http://localhost:8001';
  }

  /**
   * On startup: check if the AI engine is reachable
   */
  async onModuleInit() {
    this.logger.log(`🧠 AI Engine URL configured: ${this.aiEngineUrl}`);
    await this.checkAiEngineHealth();
  }

  /**
   * Every 5 minutes: ping the AI engine to verify it's alive
   */
  @Interval(5 * 60 * 1000) // 5 minutes
  async periodicHealthCheck() {
    await this.checkAiEngineHealth();
  }

  /**
   * Ping the AI engine's health or root endpoint
   */
  async checkAiEngineHealth(): Promise<boolean> {
    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.aiEngineUrl}/docs`, {
          timeout: 5000, // 5 second timeout
        }),
      );

      if (response.status === 200) {
        if (!this.aiEngineHealthy) {
          this.logger.log(
            `✅ AI Engine is ONLINE at ${this.aiEngineUrl} (was previously offline)`,
          );
        }
        this.aiEngineHealthy = true;
        this.consecutiveFailures = 0;
        this.lastHealthCheck = new Date();
        return true;
      }
    } catch (error) {
      this.consecutiveFailures++;
      this.aiEngineHealthy = false;
      this.lastHealthCheck = new Date();

      const msg = `🔴 AI ENGINE UNREACHABLE at ${this.aiEngineUrl} (failure #${this.consecutiveFailures})`;

      if (this.consecutiveFailures <= 1) {
        this.logger.error(msg);
        this.logger.error(
          `⚠️  POST-CALL ANALYSIS WILL FAIL! Start the AI engine: cd backend-ai && uvicorn app.main:app --port 8001`,
        );
      } else if (this.consecutiveFailures % 6 === 0) {
        // Re-warn every 30 minutes (6 × 5min intervals)
        this.logger.error(msg);
      } else {
        this.logger.warn(msg);
      }
    }
    return false;
  }

  /**
   * Get the current health status of the AI engine
   */
  getAiEngineStatus() {
    return {
      healthy: this.aiEngineHealthy,
      url: this.aiEngineUrl,
      lastCheck: this.lastHealthCheck,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  async analyzeImageDescription(
    transcript: string,
    imageLevel: string,
    imageDescription: string,
  ) {
    try {
      // We reuse the generic analyze endpoint but pass specific context
      const response = await lastValueFrom(
        this.httpService.post(`${this.aiEngineUrl}/api/analyze`, {
          text: transcript,
          user_id: 'system', // Should ideally be passed down
          session_id: 'system',
          context: `Assessment Phase 3. Image Level: ${imageLevel}. Image Description: ${imageDescription}. Require relevance score and talk style.`,
        }),
      );

      const data = response.data.data;

      // Map generic response to required format
      // If backend-ai doesn't return exactly what we need, we fallback or derive
      // For now, mapping best effort based on standard AnalysisResponse

      return {
        grammarScore: data.metrics.grammar_score,
        grammarBreakdown: data.metrics.grammar_breakdown,
        vocabularyScore: data.metrics.vocabulary_score,
        vocabBreakdown: data.metrics.vocab_breakdown,
        vocabularyCEFR: data.cefr_assessment.level,
        relevanceScore: 80, // backend-ai doesn't calculate this yet, mocking
        talkStyle: data.talkStyle || 'PASSENGER',
      };
    } catch (error) {
      this.logger.error('BrainService Phase 3 Error:', error);
      // Verify ruleBasedFallback exists or implement it here
      return this.ruleBasedFallback(transcript);
    }
  }

  async analyzeComprehensionQuality(
    transcript: string,
    question: string,
  ): Promise<any> {
    try {
      const response = await lastValueFrom(
        this.httpService.post(`${this.aiEngineUrl}/api/analyze`, {
          text: transcript,
          user_id: 'system',
          session_id: 'system',
          context: `Assessment Phase 4 Comprehension Check. Question asked: "${question}". Evaluate the response strictly for: 1. Relevance to the question, 2. Coherence, 3. Content depth. Penalize heavily if off-topic or just repeating the question. Return a strictly evaluated overall_score, grammar_score, and vocabulary_score between 0 and 100.`,
        }),
      );

      const data = response.data.data;

      // We'll use the AI's overall_score as the quality multiplier base
      return {
        qualityScore: data.metrics?.overall_score ?? 50,
        feedback: data.feedback,
      };
    } catch (error) {
      this.logger.error('BrainService Phase 4 Error:', error);
      return { qualityScore: 50, feedback: 'Quality check unavailable' };
    }
  }

  private ruleBasedFallback(transcript: string) {
    const wordCount = transcript
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    return {
      grammarScore: 40,
      vocabularyCEFR: wordCount > 30 ? 'B1' : wordCount > 15 ? 'A2' : 'A1',
      relevanceScore: 50,
      talkStyle: wordCount > 30 ? 'DRIVER' : 'PASSENGER',
    };
  }

  async interpretAzureEvidence(transcript: string, evidence: any) {
    try {
      // Build structured context with labeled Azure pronunciation data
      const azureContext = this.formatAzureEvidence(evidence);

      const response = await lastValueFrom(
        this.httpService.post(`${this.aiEngineUrl}/api/analyze`, {
          text: transcript,
          user_id: 'system',
          session_id: 'system',
          context: azureContext,
        }),
      );

      const data = response.data.data;

      // Map backend-ai errors to mistake format
      const mistakes = (data.errors || []).map((e) => ({
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
        explanation: data.feedback || 'No feedback available.',
        severity:
          mistakes.length > 3 ? 'high' : mistakes.length > 0 ? 'medium' : 'low',
        pronunciationTip:
          (data.improvement_areas || [])[0] || 'Keep practicing!',
        mistakes: mistakes,
        scores: {
          grammar: aiScores.grammar_score ?? 50,
          pronunciation: aiScores.pronunciation_score ?? 50,
          fluency: aiScores.fluency_score ?? 50,
          vocabulary: aiScores.vocabulary_score ?? 50,
          overall: aiScores.overall_score ?? 50,
        },
        grammarBreakdown: aiScores.grammar_breakdown,
        vocabBreakdown: aiScores.vocab_breakdown,
        feedback: data.feedback || '',
        strengths: data.strengths || [],
        improvementAreas: data.improvement_areas || [],
        cefrLevel: data.cefr_assessment?.level || 'B1',
        accentNotes:
          data.improvement_areas?.find(
            (a: string) =>
              a.toLowerCase().includes('accent') ||
              a.toLowerCase().includes('pronunciation'),
          ) || null,
      };
    } catch (error) {
      this.logger.error('BrainService Interpret Error:', error);
      return {
        original: transcript,
        corrected: transcript,
        explanation: 'AI service temporarily unavailable.',
        severity: 'low',
        pronunciationTip: 'Keep practicing!',
        mistakes: [],
        scores: {
          grammar: 0,
          pronunciation: 0,
          fluency: 0,
          vocabulary: 0,
          overall: 0,
        },
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
      const wordSummaries = evidence
        .slice(0, 20)
        .map(
          (w: any) =>
            `"${w.word || w.Word}" (accuracy: ${w.accuracyScore ?? w.AccuracyScore ?? 'N/A'}%, error: ${w.errorType || w.ErrorType || 'None'})`,
        )
        .join(', ');

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

  async assessPronunciation(azureResult: Record<string, unknown>) {
    try {
      // Create url-encoded form data or send as JSON. The fastAPI endpoint expects Form(None) for azure_result.
      // Wait, let's look at pronunciation.py: `azure_result: str | None = Form(None)`
      const formData = new URLSearchParams();
      formData.append('azure_result', JSON.stringify(azureResult));

      const response = await lastValueFrom(
        this.httpService.post(
          `${this.aiEngineUrl}/pronunciation/assess`,
          formData,
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('BrainService Pronunciation Error:', error);
      return { flagged_errors: [] };
    }
  }

  async analyzeSession(sessionId: string, transcript: string, userId: string) {
    try {
      const response = await lastValueFrom(
        this.httpService.post(`${this.aiEngineUrl}/api/analyze`, {
          text: transcript,
          user_id: userId,
          session_id: sessionId,
          context: 'Analyze this conversation transcript.',
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error('BrainService Analyze Session Error:', error);
      throw error;
    }
  }

  async analyzeJoint(sessionId: string, segments: any[]) {
    try {
      const response = await lastValueFrom(
        this.httpService.post(`${this.aiEngineUrl}/api/analyze-joint`, {
          session_id: sessionId,
          segments: segments,
        }),
      );

      return response.data.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const body = error?.response?.data;
      this.logger.error(
        `BrainService Joint Analysis Error: ${error?.message} (status ${status}). Body: ${JSON.stringify(body ?? {})}`,
      );
      throw error;
    }
  }

  async generateWeeklySummary(
    userId: string,
    stats: {
      sessions: number;
      avgScore: number;
      strength: string;
      weakness: string;
      improvement: number;
    },
  ): Promise<string> {
    try {
      const response = await lastValueFrom(
        this.httpService.post(`${this.aiEngineUrl}/api/analyze`, {
          text: `UserID: ${userId}`,
          user_id: userId,
          session_id: 'weekly_summary',
          context: `Generate a short (2-3 sentences), highly personalized, and motivating weekly progress summary for an English learner. 
          Stats for the week:
          - Sessions completed: ${stats.sessions}
          - Average score: ${stats.avgScore}/100
          - Strongest skill: ${stats.strength}
          - Skill needing focus: ${stats.weakness}
          - Score improvement: ${stats.improvement} points
          Tone: Encouraging, professional, and coach-like. Mention a specific "win" and one specific "goal" for next week.`,
        }),
      );

      return (
        response.data.data?.feedback ||
        `Great job this week! You've completed ${stats.sessions} sessions and shown strong ${stats.strength}. Focus more on ${stats.weakness} next week.`
      );
    } catch (error) {
      this.logger.error('BrainService Weekly Summary Error:', error);
      return `You had a productive week with ${stats.sessions} sessions! Your ${stats.strength} is improving. Keep it up!`;
    }
  }
}
