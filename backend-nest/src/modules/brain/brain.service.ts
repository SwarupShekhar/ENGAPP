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
   * Ping the AI engine's health or root endpoint.
   * Render free tier cold starts often need 15–60s; default 5s caused false "unreachable".
   */
  async checkAiEngineHealth(): Promise<boolean> {
    const timeoutMs = Math.max(
      5000,
      Number(this.configService.get<string>('AI_ENGINE_HEALTH_TIMEOUT_MS')) ||
        25000,
    );
    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.aiEngineUrl.replace(/\/$/, '')}/`, {
          timeout: timeoutMs,
        }),
      );

      if (response.status >= 200 && response.status < 300) {
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
    } catch (error: any) {
      this.consecutiveFailures++;
      this.aiEngineHealthy = false;
      this.lastHealthCheck = new Date();

      const detail =
        error?.code ||
        error?.message ||
        error?.response?.status ||
        String(error);
      const msg = `🔴 AI ENGINE UNREACHABLE at ${this.aiEngineUrl} (failure #${this.consecutiveFailures}) — ${detail}`;

      if (this.consecutiveFailures <= 1) {
        this.logger.error(msg);
        this.logger.error(
          `⚠️  If URLs are correct, this is often Render cold start or the AI service sleeping. Open ${this.aiEngineUrl}/ in a browser to wake it, or raise AI_ENGINE_HEALTH_TIMEOUT_MS. Local dev: cd backend-ai && uvicorn app.main:app --port 8001`,
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

  /**
   * Post-call authoritative scoring (CQS).
   */
  async computeCQS(body: {
    user_turns: string[];
    full_transcript: string;
    azure_results: any[];
    call_duration_seconds: number;
    user_spoke_seconds: number;
  }): Promise<any> {
    try {
      const response = await lastValueFrom(
        this.httpService.post(`${this.aiEngineUrl}/api/scoring/cqs`, body, {
          timeout: 15000,
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error('BrainService computeCQS error:', error);
      return null;
    }
  }

  /**
   * Phase 2: Compute Pronunciation Quality Score (PQS).
   */
  async computePQS(body: {
    session_id: string;
    user_id: string;
    pronunciation_result: any[];
  }): Promise<any> {
    try {
      const response = await lastValueFrom(
        this.httpService.post(`${this.aiEngineUrl}/api/scoring/pqs`, body, {
          timeout: 10000,
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error('BrainService computePQS error:', error);
      return null;
    }
  }

  /**
   * Real-time lightweight preview status.
   */
  async computePreview(userTurnsSoFar: string[]): Promise<any> {
    try {
      const response = await lastValueFrom(
        this.httpService.post(`${this.aiEngineUrl}/api/scoring/preview`, {
          user_turns_so_far: userTurnsSoFar,
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error('BrainService computePreview error:', error);
      return { status: 'neutral', signal: 0, hint: 'Calculation paused' };
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
    data: {
      sessions: number;
      avgScore: number;
      lastWeekAvgScore: number;
      avgScoreDelta: number;
      skillBreakdown: {
        grammar: { score: number; errorCount: number; topErrorType: string | null; delta: number };
        pronunciation: { score: number; problemSounds: string[]; delta: number };
        fluency: { score: number; fillerWordCount: number; avgWPM: number; delta: number };
        vocabulary: { score: number; newWordsUsed: number; wordsToReview: number; delta: number };
      };
      strongestSkill: string;
      weakestSkill: string;
      mostImprovedSkill: string;
      mostImprovedDelta: number;
      biggestDropSkill: string | null;
      biggestDropAmount: number;
      actionableFocus: any;
    },
  ): Promise<string> {
    try {
      const prompt = `You are Maya, an English learning coach. Write a 2-sentence weekly summary for a learner with this data:

- Sessions: ${data.sessions}
- Average score: ${data.avgScore} (last week: ${data.lastWeekAvgScore}, delta: ${data.avgScoreDelta >= 0 ? '+' : ''}${data.avgScoreDelta})
- Grammar: ${data.skillBreakdown.grammar.score} (${data.skillBreakdown.grammar.errorCount} errors, mainly ${data.skillBreakdown.grammar.topErrorType || 'general'}, delta: ${data.skillBreakdown.grammar.delta >= 0 ? '+' : ''}${data.skillBreakdown.grammar.delta})
- Pronunciation: ${data.skillBreakdown.pronunciation.score} (problem sounds: ${data.skillBreakdown.pronunciation.problemSounds.join(', ') || 'none'}, delta: ${data.skillBreakdown.pronunciation.delta >= 0 ? '+' : ''}${data.skillBreakdown.pronunciation.delta})
- Fluency: ${data.skillBreakdown.fluency.score} (${data.skillBreakdown.fluency.fillerWordCount} filler words avg, ${data.skillBreakdown.fluency.avgWPM} WPM, delta: ${data.skillBreakdown.fluency.delta >= 0 ? '+' : ''}${data.skillBreakdown.fluency.delta})
- Vocabulary: ${data.skillBreakdown.vocabulary.score} (${data.skillBreakdown.vocabulary.newWordsUsed} new words, ${data.skillBreakdown.vocabulary.wordsToReview} to review, delta: ${data.skillBreakdown.vocabulary.delta >= 0 ? '+' : ''}${data.skillBreakdown.vocabulary.delta})
- Most improved: ${data.mostImprovedSkill} (+${data.mostImprovedDelta})
- Biggest drop: ${data.biggestDropSkill || 'none'} (${data.biggestDropAmount})

Rules:
1. Mention exactly one strength with a specific number
2. Mention exactly one area to improve with a specific number
3. Never use generic praise like "great job" or "keep it up" without a specific data point
4. Write as if speaking directly to the learner, use "you" not "the learner"
5. Maximum 40 words total
6. Be specific and actionable`;

      const response = await lastValueFrom(
        this.httpService.post(`${this.aiEngineUrl}/api/analyze`, {
          text: `UserID: ${userId}`,
          user_id: userId,
          session_id: 'weekly_summary',
          context: prompt,
        }),
      );

      return (
        response.data.data?.feedback ||
        `Your ${data.strongestSkill} improved ${data.mostImprovedDelta >= 0 ? data.mostImprovedDelta : 0} points to ${data.skillBreakdown[data.strongestSkill as keyof typeof data.skillBreakdown]?.score || data.avgScore}. Focus on ${data.weakestSkill} which dropped ${data.biggestDropAmount < 0 ? Math.abs(data.biggestDropAmount) : 0} points.`
      );
    } catch (error) {
      this.logger.error('BrainService Weekly Summary Error:', error);
      // Fallback to specific data-driven summary
      const strengthScore = data.skillBreakdown[data.strongestSkill as keyof typeof data.skillBreakdown]?.score || data.avgScore;
      const weaknessScore = data.skillBreakdown[data.weakestSkill as keyof typeof data.skillBreakdown]?.score || data.avgScore;
      return `Your ${data.strongestSkill} reached ${strengthScore} points. ${data.weakestSkill} needs attention at ${weaknessScore} points.`;
    }
  }
}
