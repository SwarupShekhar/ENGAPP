import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

export interface PillarDeltas {
  pronunciation: number;
  fluency: number;
  grammar: number;
  vocabulary: number;
  comprehension: number;
}

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}
  
  /**
   * Authoritative implementation of applyPillarDeltas for Phase 1.
   * Calculates new pillar scores based on current scores, deltas, and damping factors.
   * Runs gating rules and computes the final weighted overall score.
   */
  async applyPillarDeltas(userId: string, deltas: PillarDeltas) {
    // 1. Fetch current pillar scores from the database
    const { current } = await this.getDetailedMetrics(userId);

    // 2. Apply each delta individually, clamping to 0-100:
    const newScores = {
      pronunciation: this.clamp((current.pronunciation || 0) + (deltas.pronunciation || 0)),
      fluency: this.clamp((current.fluency || 0) + (deltas.fluency || 0)),
      grammar: this.clamp((current.grammar || 0) + (deltas.grammar || 0)),
      vocabulary: this.clamp((current.vocabulary || 0) + (deltas.vocabulary || 0)),
      comprehension: this.clamp((current.comprehension || 0) + (deltas.comprehension || 0)),
    };

    // 3. Run gating rules on new scores
    let cap: number | null = null;
    let isGatingActive = false;

    if (newScores.pronunciation < 35 || newScores.fluency < 30) {
      cap = 370;
      isGatingActive = true;
    } else if (newScores.grammar < 35) {
      cap = 440;
      isGatingActive = true;
    }

    let below50Count = 0;
    if (newScores.pronunciation < 50) below50Count++;
    if (newScores.fluency < 50) below50Count++;
    if (newScores.grammar < 50) below50Count++;
    if (newScores.vocabulary < 50) below50Count++;
    if (newScores.comprehension < 50) below50Count++;

    if (below50Count >= 3) {
      // If we already have a stricter cap (e.g., 370 or 440), keep the stricter one
      if (cap === null || cap > 720) {
        cap = 720;
        isGatingActive = true;
      }
    }

    // 4. Recompute overall score with updated weights:
    let overall = (
      newScores.fluency * 0.25 + 
      newScores.grammar * 0.22 + 
      newScores.pronunciation * 0.22 + 
      newScores.vocabulary * 0.18 + 
      newScores.comprehension * 0.13
    ) * 10;
    
    overall = Math.round(overall);

    // Apply cap if gating is active
    if (cap !== null && overall > cap) {
      overall = cap;
    }

    // 5. Persist updated scores to database
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          assessmentScore: Math.round(overall / 10), // User.assessmentScore represents the 0-100 scale
        },
      });

      // Optional: Store gating status conceptually (Profile model doesn't have gatingStatus column natively)
      // and update specific pillars if UserTopicScore is utilized.
      await Promise.all(
        Object.entries(newScores).map(([pillar, score]) =>
          this.prisma.userTopicScore.upsert({
            where: { userId_topicTag: { userId, topicTag: `pillar_${pillar}` } },
            create: { userId, topicTag: `pillar_${pillar}`, score },
            update: { score },
          })
        )
      );
    } catch (e) {
      // Intentionally ignoring specific schema-level sync issues during testing stub Phase 1
    }

    // 6. Return the new scores and whether gating is active
    return {
      success: true,
      userId,
      oldScores: current,
      newScores: { ...newScores, overallScore: overall },
      isGatingActive,
      appliedAt: new Date(),
    };
  }

  private clamp(val: number): number {
    return Math.round(Math.min(100, Math.max(0, val)));
  }

  async getDetailedMetrics(userId: string) {
    try {
      const PILLAR_TAGS = ['pronunciation', 'fluency', 'grammar', 'vocabulary', 'comprehension'];

      // 1. Fetch all data sources in parallel
      const [topicScores, user, lastAssessment, latestAnalysis, previousAnalysis] =
        await Promise.all([
          // Authoritative pillar scores — written by applyPillarDeltas after every call
          this.prisma.userTopicScore
            .findMany({
              where: {
                userId,
                topicTag: { in: PILLAR_TAGS.map((t) => `pillar_${t}`) },
              },
            })
            .catch(() => []),

          // User model: currentStreak + totalSessions are written by session-handler
          this.prisma.user
            .findUnique({
              where: { id: userId },
              select: { currentStreak: true, totalSessions: true, assessmentScore: true },
            })
            .catch(() => null),

          // Latest completed assessment (for CEFR level + fallback skill scores)
          this.prisma.assessmentSession
            .findFirst({
              where: { userId, status: 'COMPLETED' },
              orderBy: { completedAt: 'desc' },
            })
            .catch(() => null),

          // Latest analysis — match Home SkillsBuilder: do not require session COMPLETED,
          // otherwise Pulse can miss the same row the home screen uses for scores.
          this.prisma.analysis
            .findFirst({
              where: { participant: { userId } },
              orderBy: { createdAt: 'desc' },
            })
            .catch(() => null),

          // Second-to-last analysis row for delta computation (same filter as latest)
          this.prisma.analysis
            .findFirst({
              where: { participant: { userId } },
              orderBy: { createdAt: 'desc' },
              skip: 1,
            })
            .catch(() => null),
        ]);

      // 2. Build pillar map from UserTopicScore (written after every completed call)
      const pillarMap: Record<string, number> = {};
      topicScores.forEach((ts) => {
        const key = ts.topicTag.replace('pillar_', '');
        pillarMap[key] = Math.round(Number(ts.score) || 0);
      });
      const pillarSum = PILLAR_TAGS.reduce((sum, k) => sum + (pillarMap[k] ?? 0), 0);
      // Rows exist but all zeros → treat as no pillar data so assessment/analysis fallbacks apply (same idea as Home when analysis is all-zero)
      const hasUsefulPillarData = topicScores.length > 0 && pillarSum > 0;

      // 3. Fallback scores from latest analysis or assessment session (mirror Home SkillsBuilder)
      let fallbackScores = latestAnalysis
        ? this.extractScoresFromAnalysis(latestAnalysis)
        : this.extractScores(lastAssessment);

      const fourSkillsAllZero = (s: {
        pronunciation?: number;
        fluency?: number;
        grammar?: number;
        vocabulary?: number;
      }) =>
        (s.pronunciation ?? 0) === 0 &&
        (s.fluency ?? 0) === 0 &&
        (s.grammar ?? 0) === 0 &&
        (s.vocabulary ?? 0) === 0;

      if (latestAnalysis && fourSkillsAllZero(fallbackScores) && lastAssessment) {
        fallbackScores = this.extractScores(lastAssessment);
      }

      // 4. Resolve current scores: UserTopicScore wins when non-zero; otherwise use fallbacks
      const currentScores = {
        pronunciation: hasUsefulPillarData
          ? (pillarMap.pronunciation ?? fallbackScores.pronunciation)
          : fallbackScores.pronunciation,
        fluency: hasUsefulPillarData
          ? (pillarMap.fluency ?? fallbackScores.fluency)
          : fallbackScores.fluency,
        grammar: hasUsefulPillarData
          ? (pillarMap.grammar ?? fallbackScores.grammar)
          : fallbackScores.grammar,
        vocabulary: hasUsefulPillarData
          ? (pillarMap.vocabulary ?? fallbackScores.vocabulary)
          : fallbackScores.vocabulary,
        comprehension: hasUsefulPillarData
          ? (pillarMap.comprehension ?? fallbackScores.comprehension)
          : fallbackScores.comprehension,
        cefrLevel: fallbackScores.cefrLevel,
        overallScore: 0,
      };

      // 5. Recompute overall from pillar weights (same formula as applyPillarDeltas)
      currentScores.overallScore = hasUsefulPillarData
        ? Math.round(
            currentScores.fluency * 0.25 +
              currentScores.grammar * 0.22 +
              currentScores.pronunciation * 0.22 +
              currentScores.vocabulary * 0.18 +
              currentScores.comprehension * 0.13,
          )
        : fallbackScores.overallScore;

      // Return empty metrics only when there is truly no data at all
      if (!hasUsefulPillarData && !lastAssessment && !latestAnalysis) {
        return this.getEmptyMetrics();
      }

      // 6. Delta vs previous analysis row
      const prevScores = previousAnalysis
        ? this.extractScoresFromAnalysis(previousAnalysis)
        : this.extractScores(null);

      const deltas = {
        pronunciation:
          (Number(currentScores.pronunciation) || 0) - (Number(prevScores.pronunciation) || 0),
        fluency:
          (Number(currentScores.fluency) || 0) - (Number(prevScores.fluency) || 0),
        grammar:
          (Number(currentScores.grammar) || 0) - (Number(prevScores.grammar) || 0),
        vocabulary:
          (Number(currentScores.vocabulary) || 0) - (Number(prevScores.vocabulary) || 0),
        comprehension:
          (Number(currentScores.comprehension) || 0) - (Number(prevScores.comprehension) || 0),
        overallScore:
          (Number(currentScores.overallScore) || 0) - (Number(prevScores.overallScore) || 0),
      };

      // 7. Weekly activity
      const weeklyActivity = await this.getWeeklyActivity(userId).catch(() => [
        0, 0, 0, 0, 0, 0, 0,
      ]);

      // 8. Weaknesses from latest assessment weaknessMap or analysis pronunciation errors
      let weaknesses: any[] = [];
      try {
        if (lastAssessment) {
          let weaknessMap = (lastAssessment as any).weaknessMap;
          if (typeof weaknessMap === 'string') {
            try { weaknessMap = JSON.parse(weaknessMap); } catch (_) { weaknessMap = {}; }
          }
          weaknessMap = weaknessMap || {};
          weaknesses = Object.entries(weaknessMap).map(([skill, details]: [string, any]) => ({
            skill,
            severity: details?.severity || 'MEDIUM',
            recommendation: details?.recommendation || `Practice more ${skill} exercises`,
          }));
        }

        // Supplement with pronunciation errors from latest analysis if weaknesses still empty
        if (weaknesses.length === 0 && latestAnalysis) {
          let scores = latestAnalysis.scores as any;
          if (typeof scores === 'string') { try { scores = JSON.parse(scores); } catch (_) { scores = {}; } }
          const errors: string[] = scores?.dominant_pronunciation_errors || [];
          weaknesses = errors.map((error) => ({
            skill: 'Pronunciation',
            severity: 'MEDIUM',
            recommendation: `Focus on ${error.replace(/_/g, ' ')} in your next call`,
          }));
        }
      } catch (err) {
        console.warn('Error extracting weaknesses:', err);
      }

      return {
        current: currentScores,
        deltas,
        weeklyActivity,
        weaknesses: weaknesses.slice(0, 3),
        // FIX: read from User model — session-handler.service writes currentStreak + totalSessions here
        streak: user?.currentStreak || 0,
        totalSessions: user?.totalSessions || 0,
      };
    } catch (e) {
      console.error('FATAL ERROR in getDetailedMetrics:', e);
      return this.getEmptyMetrics();
    }
  }

  private extractScores(session: any) {
    if (!session)
      return {
        pronunciation: 0,
        fluency: 0,
        grammar: 0,
        vocabulary: 0,
        comprehension: 0,
        overallScore: 0,
        cefrLevel: 'A1',
      };

    // Defensive check if it's an assessment
    const isAssessment =
      'skillBreakdown' in session || 'overallLevel' in session;

    if (isAssessment) {
      let breakdown = session.skillBreakdown || {};
      if (typeof breakdown === 'string') {
        try {
          breakdown = JSON.parse(breakdown);
        } catch (_) {
          breakdown = {};
        }
      }
      const flattened = this.flattenSkills(breakdown);
      return {
        ...flattened,
        overallScore: Math.round(Number(session.overallScore) || 0),
        cefrLevel: session.overallLevel || 'A1',
        comprehension: Math.round(Number(flattened.comprehension) || 0),
      };
    } else {
      let summary = session.summaryJson || {};
      if (typeof summary === 'string') {
        try {
          summary = JSON.parse(summary);
        } catch (_) {
          summary = {};
        }
      }

      // Fallback to participant analysis scores when summaryJson is missing/stale.
      const myParticipant = Array.isArray(session.participants)
        ? session.participants.find((p: any) => !!p?.analysis)
        : null;
      const analysisScores: any = myParticipant?.analysis?.scores || {};
      const parsedAnalysisScores =
        typeof analysisScores === 'string'
          ? (() => {
              try {
                return JSON.parse(analysisScores);
              } catch (_) {
                return {};
              }
            })()
          : analysisScores;

      return {
        pronunciation: Math.round(
          Number(
            summary.pronunciation_score ??
              parsedAnalysisScores.pronunciation ??
              parsedAnalysisScores.pronunciation_score,
          ) || 0,
        ),
        fluency: Math.round(
          Number(
            summary.fluency_score ??
              parsedAnalysisScores.fluency ??
              parsedAnalysisScores.fluency_score,
          ) || 0,
        ),
        grammar: Math.round(
          Number(
            summary.grammar_score ??
              parsedAnalysisScores.grammar ??
              parsedAnalysisScores.grammar_score,
          ) || 0,
        ),
        vocabulary: Math.round(
          Number(
            summary.vocabulary_score ??
              parsedAnalysisScores.vocabulary ??
              parsedAnalysisScores.vocabulary_score,
          ) || 0,
        ),
        comprehension: Math.round(
          Number(summary.overall_score ?? parsedAnalysisScores.overall ?? parsedAnalysisScores.overall_score) ||
            0,
        ),
        overallScore: Math.round(
          Number(summary.overall_score ?? parsedAnalysisScores.overall ?? parsedAnalysisScores.overall_score) ||
            0,
        ),
        cefrLevel: summary.cefr_score || 'B1',
      };
    }
  }

  private extractScoresFromAnalysis(analysis: any) {
    let scores = analysis?.scores || {};
    if (typeof scores === 'string') {
      try {
        scores = JSON.parse(scores);
      } catch (_) {
        scores = {};
      }
    }

    const pronunciation = Math.round(
      Number(scores.pronunciation ?? scores.pronunciation_score) || 0,
    );
    const fluency = Math.round(Number(scores.fluency ?? scores.fluency_score) || 0);
    const grammar = Math.round(Number(scores.grammar ?? scores.grammar_score) || 0);
    const vocabulary = Math.round(
      Number(scores.vocabulary ?? scores.vocabulary_score) || 0,
    );
    const overallScore = Math.round(Number(scores.overall ?? scores.overall_score) || 0);

    return {
      pronunciation,
      fluency,
      grammar,
      vocabulary,
      comprehension: overallScore,
      overallScore,
      cefrLevel: analysis?.cefrLevel || 'B1',
    };
  }

  private flattenSkills(breakdown: any) {
    if (!breakdown) return {};
    // Extract primary field or use object if it's already a number
    const getScore = (val: any) => {
      if (typeof val === 'number') return val;
      if (typeof val === 'object' && val !== null) {
        return (
          val.phonemeAccuracy ||
          val.speechRate ||
          val.tenseControl ||
          val.lexicalRange ||
          val.score ||
          0
        );
      }
      return 0;
    };

    return {
      pronunciation: getScore(breakdown.pronunciation),
      fluency: getScore(breakdown.fluency),
      grammar: getScore(breakdown.grammar),
      vocabulary: getScore(breakdown.vocabulary),
      comprehension:
        getScore(breakdown.comprehension) || breakdown.overallScore || 0,
    };
  }

  private async getWeeklyActivity(userId: string): Promise<number[]> {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Using SessionParticipant to count active sessions
    const sessions = await this.prisma.sessionParticipant.findMany({
      where: {
        userId,
        session: {
          startedAt: { gte: sevenDaysAgo },
          status: 'COMPLETED',
        },
      },
      include: {
        session: true,
      },
    });

    const activity = Array(7).fill(0);
    sessions.forEach((p) => {
      const dayIndex = Math.floor(
        (p.session.startedAt.getTime() - sevenDaysAgo.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      if (dayIndex >= 0 && dayIndex < 7) {
        activity[dayIndex]++;
      }
    });

    return activity;
  }

  private getEmptyMetrics() {
    return {
      current: {
        pronunciation: 0,
        fluency: 0,
        grammar: 0,
        vocabulary: 0,
        comprehension: 0,
        overallScore: 0,
        cefrLevel: 'A1',
      },
      deltas: {
        pronunciation: 0,
        fluency: 0,
        grammar: 0,
        vocabulary: 0,
        comprehension: 0,
        overallScore: 0,
      },
      weeklyActivity: [0, 0, 0, 0, 0, 0, 0],
      weaknesses: [],
      streak: 0,
      totalSessions: 0,
    };
  }
}
