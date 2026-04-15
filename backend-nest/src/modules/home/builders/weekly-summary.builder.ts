import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { BrainService } from '../../brain/brain.service';

@Injectable()
export class WeeklySummaryBuilder {
  private readonly logger = new Logger(WeeklySummaryBuilder.name);

  constructor(
    private prisma: PrismaService,
    private brain: BrainService,
  ) {}

  async build(userId: string) {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(today.getDate() - 14);

    // 1. Fetch recent sessions with analysis
    const [thisWeekSessions, lastWeekSessions] = await Promise.all([
      this.prisma.sessionParticipant.findMany({
        where: {
          userId,
          session: {
            startedAt: { gte: sevenDaysAgo },
            status: 'COMPLETED',
          },
        },
        include: {
          analysis: true,
          session: true,
        },
        orderBy: {
          session: {
            startedAt: 'desc',
          },
        },
      }),
      this.prisma.sessionParticipant.findMany({
        where: {
          userId,
          session: {
            startedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
            status: 'COMPLETED',
          },
        },
        include: {
          analysis: true,
          session: true,
        },
      }),
    ]);

    // Edge case: No sessions this week
    if (thisWeekSessions.length === 0) {
      return {
        type: 'weekly_summary',
        priority: 2,
        data: {
          text: '',
          sessionsCount: 0,
          avgScore: 0,
          skillBreakdown: null,
          actionableFocus: null,
          edgeCase: 'no_sessions',
          highlights: [],
        },
      };
    }

    // Edge case: First week with minimal data
    if (thisWeekSessions.length < 2) {
      return {
        type: 'weekly_summary',
        priority: 2,
        data: {
          text: `Complete ${3 - thisWeekSessions.length} more sessions and Maya will have enough data to give you a full weekly insight.`,
          sessionsCount: thisWeekSessions.length,
          avgScore: 0,
          skillBreakdown: null,
          actionableFocus: {
            label: 'This week, focus on',
            recommendation:
              'Complete your practice sessions to build your learning baseline',
            actionLabel: 'Start a Session',
            action: 'start_session',
          },
          edgeCase: 'first_week',
          progressTarget: 3,
          highlights: [],
        },
      };
    }

    // 2. Aggregate detailed stats for this week
    const aggregateSessionStats = (sessions: any[]) => {
      let totalScore = 0;
      let validCount = 0;
      const skillScores = {
        fluency: [] as number[],
        grammar: [] as number[],
        vocabulary: [] as number[],
        pronunciation: [] as number[],
      };
      let totalErrors = 0;
      const errorTypes = new Map<string, number>();
      let totalDuration = 0;
      let fillerWordCount = 0;
      const problemSounds = new Set<string>();
      const newWordsUsed = new Set<string>();
      const wordsToReview = new Set<string>();

      sessions.forEach((s) => {
        const analysis = s.analysis as any;
        const sessionDuration = s.session?.duration || 0;
        totalDuration += sessionDuration;

        if (analysis && analysis.scores) {
          const scores = analysis.scores;
          skillScores.fluency.push(scores.fluency || 0);
          skillScores.grammar.push(scores.grammar || 0);
          skillScores.vocabulary.push(scores.vocabulary || 0);
          skillScores.pronunciation.push(scores.pronunciation || 0);
          totalScore += scores.overall || 0;
          validCount++;
        }

        // Extract detailed metrics
        if (analysis?.mistakes) {
          totalErrors += analysis.mistakes.length || 0;
          analysis.mistakes.forEach((mistake: any) => {
            const errorType = mistake.type || mistake.rule || 'general';
            errorTypes.set(errorType, (errorTypes.get(errorType) || 0) + 1);

            // Track words to review
            if (mistake.corrected_text || mistake.corrected) {
              wordsToReview.add(mistake.corrected_text || mistake.corrected);
            }
          });
        }

        // Pronunciation issues
        if (analysis?.pronunciationIssues) {
          analysis.pronunciationIssues.forEach((issue: any) => {
            if (issue.word || issue.phoneme) {
              problemSounds.add(issue.word || issue.phoneme);
            }
          });
        }

        // Vocabulary tracking
        if (analysis?.vocabulary?.advanced_words) {
          analysis.vocabulary.advanced_words.forEach((word: string) => {
            newWordsUsed.add(word);
          });
        }

        // Fluency metrics
        if (analysis?.fluency?.filler_words) {
          fillerWordCount += analysis.fluency.filler_words.length || 0;
        }
      });

      return {
        totalScore,
        validCount,
        skillScores,
        totalErrors,
        errorTypes,
        totalDuration,
        fillerWordCount,
        problemSounds,
        newWordsUsed,
        wordsToReview,
      };
    };

    const thisWeekStats = aggregateSessionStats(thisWeekSessions);
    const lastWeekStats =
      lastWeekSessions.length > 0
        ? aggregateSessionStats(lastWeekSessions)
        : null;

    if (thisWeekStats.validCount === 0) {
      return {
        type: 'weekly_summary',
        priority: 2,
        data: {
          text: 'Your sessions are still being analyzed. Check back soon for your weekly insights!',
          sessionsCount: thisWeekSessions.length,
          avgScore: 0,
          skillBreakdown: null,
          actionableFocus: null,
          edgeCase: 'analyzing',
          highlights: [],
        },
      };
    }

    // 3. Calculate averages and deltas
    const avgOverall = Math.round(
      thisWeekStats.totalScore / thisWeekStats.validCount,
    );
    const avgSkills = {
      fluency: Math.round(
        thisWeekStats.skillScores.fluency.reduce((a, b) => a + b, 0) /
          thisWeekStats.skillScores.fluency.length || 0,
      ),
      grammar: Math.round(
        thisWeekStats.skillScores.grammar.reduce((a, b) => a + b, 0) /
          thisWeekStats.skillScores.grammar.length || 0,
      ),
      vocabulary: Math.round(
        thisWeekStats.skillScores.vocabulary.reduce((a, b) => a + b, 0) /
          thisWeekStats.skillScores.vocabulary.length || 0,
      ),
      pronunciation: Math.round(
        thisWeekStats.skillScores.pronunciation.reduce((a, b) => a + b, 0) /
          thisWeekStats.skillScores.pronunciation.length || 0,
      ),
    };

    // Calculate skill deltas (this week vs last week)
    const skillDeltas = lastWeekStats
      ? {
          fluency:
            avgSkills.fluency -
            Math.round(
              lastWeekStats.skillScores.fluency.reduce((a, b) => a + b, 0) /
                lastWeekStats.skillScores.fluency.length || 0,
            ),
          grammar:
            avgSkills.grammar -
            Math.round(
              lastWeekStats.skillScores.grammar.reduce((a, b) => a + b, 0) /
                lastWeekStats.skillScores.grammar.length || 0,
            ),
          vocabulary:
            avgSkills.vocabulary -
            Math.round(
              lastWeekStats.skillScores.vocabulary.reduce((a, b) => a + b, 0) /
                lastWeekStats.skillScores.vocabulary.length || 0,
            ),
          pronunciation:
            avgSkills.pronunciation -
            Math.round(
              lastWeekStats.skillScores.pronunciation.reduce(
                (a, b) => a + b,
                0,
              ) / lastWeekStats.skillScores.pronunciation.length || 0,
            ),
        }
      : { fluency: 0, grammar: 0, vocabulary: 0, pronunciation: 0 };

    const lastWeekAvg = lastWeekStats
      ? Math.round(lastWeekStats.totalScore / lastWeekStats.validCount)
      : avgOverall;
    const avgScoreDelta = avgOverall - lastWeekAvg;

    // 4. Identify strengths, weaknesses, and patterns
    const sortedSkills = Object.entries(avgSkills).sort((a, b) => b[1] - a[1]);
    const strongestSkill = sortedSkills[0][0];
    const weakestSkill = sortedSkills[sortedSkills.length - 1][0];

    // Find most improved skill
    const sortedDeltas = Object.entries(skillDeltas).sort(
      (a, b) => b[1] - a[1],
    );
    const mostImprovedSkill = sortedDeltas[0][0];
    const mostImprovedDelta = sortedDeltas[0][1];

    // Find skill that dropped most
    const biggestDrop = sortedDeltas
      .filter(([, delta]) => delta < 0)
      .sort((a, b) => a[1] - b[1])[0];
    const biggestDropSkill = biggestDrop?.[0];
    const biggestDropAmount = biggestDrop?.[1] || 0;

    // Get top error type
    const topErrorType =
      thisWeekStats.errorTypes.size > 0
        ? [...thisWeekStats.errorTypes.entries()].sort(
            (a, b) => b[1] - a[1],
          )[0][0]
        : null;

    // Calculate session metrics
    const avgSessionDuration = Math.round(
      thisWeekStats.totalDuration / thisWeekSessions.length,
    );
    const avgFillerWords = Math.round(
      thisWeekStats.fillerWordCount / thisWeekSessions.length,
    );
    const avgWPM =
      avgSessionDuration > 0
        ? Math.round((thisWeekStats.totalScore * 10) / avgSessionDuration)
        : 0;

    // 5. Generate actionable focus recommendation
    const generateActionableFocus = () => {
      // Priority 1: Biggest skill drop
      if (biggestDrop && biggestDropAmount <= -5) {
        const skillName =
          biggestDropSkill.charAt(0).toUpperCase() + biggestDropSkill.slice(1);
        if (
          biggestDropSkill === 'pronunciation' &&
          thisWeekStats.problemSounds.size > 0
        ) {
          const problemSoundsList = Array.from(thisWeekStats.problemSounds)
            .slice(0, 3)
            .join(', ');
          return {
            label: 'This week, focus on',
            recommendation: `Pronunciation — practice ${problemSoundsList} sounds, mispronounced in ${thisWeekSessions.length} sessions`,
            actionLabel: 'Practice Sounds',
            action: 'practice_pronunciation',
            priority: 'high',
          };
        }
        if (biggestDropSkill === 'grammar' && topErrorType) {
          return {
            label: 'This week, focus on',
            recommendation: `Grammar — ${topErrorType} errors appeared ${thisWeekStats.errorTypes.get(topErrorType)} times`,
            actionLabel: 'Review Grammar',
            action: 'review_grammar',
            priority: 'high',
          };
        }
        if (biggestDropSkill === 'fluency' && avgFillerWords > 3) {
          return {
            label: 'This week, focus on',
            recommendation: `Reduce filler words — you averaged ${avgFillerWords} per session, aim for under 3`,
            actionLabel: 'Practice Fluency',
            action: 'practice_fluency',
            priority: 'high',
          };
        }
        if (
          biggestDropSkill === 'vocabulary' &&
          thisWeekStats.wordsToReview.size > 0
        ) {
          return {
            label: 'This week, focus on',
            recommendation: `Review ${thisWeekStats.wordsToReview.size} vocabulary words flagged this week`,
            actionLabel: 'Review Words',
            action: 'review_vocabulary',
            priority: 'high',
          };
        }
      }

      // Priority 2: Weakest skill under 80
      if (avgSkills[weakestSkill] < 80) {
        const skillName =
          weakestSkill.charAt(0).toUpperCase() + weakestSkill.slice(1);
        if (
          weakestSkill === 'pronunciation' &&
          thisWeekStats.problemSounds.size > 0
        ) {
          const problemSoundsList = Array.from(thisWeekStats.problemSounds)
            .slice(0, 2)
            .join(' and ');
          return {
            label: 'This week, focus on',
            recommendation: `Practice ${problemSoundsList} sounds — your weakest area at ${avgSkills[weakestSkill]} points`,
            actionLabel: 'Start Practice',
            action: 'practice_pronunciation',
            priority: 'medium',
          };
        }
        return {
          label: 'This week, focus on',
          recommendation: `${skillName} — your weakest skill at ${avgSkills[weakestSkill]} points`,
          actionLabel: 'Practice Now',
          action: `practice_${weakestSkill}`,
          priority: 'medium',
        };
      }

      // Priority 3: Perfect scores - next challenge
      if (avgOverall >= 95) {
        const nextChallenge = sortedSkills.filter(([, score]) => score < 95)[0];
        if (nextChallenge) {
          const skillName =
            nextChallenge[0].charAt(0).toUpperCase() +
            nextChallenge[0].slice(1);
          return {
            label: 'Ready for the next challenge',
            recommendation: `Push ${skillName} from ${nextChallenge[1]} toward 95`,
            actionLabel: 'Start Now',
            action: `practice_${nextChallenge[0]}`,
            priority: 'challenge',
          };
        }
      }

      // Default: Most improved skill
      if (mostImprovedDelta >= 5) {
        const skillName =
          mostImprovedSkill.charAt(0).toUpperCase() +
          mostImprovedSkill.slice(1);
        return {
          label: 'Keep the momentum',
          recommendation: `${skillName} improved ${mostImprovedDelta} points — build on this strength`,
          actionLabel: 'Continue Practice',
          action: `practice_${mostImprovedSkill}`,
          priority: 'momentum',
        };
      }

      return {
        label: 'This week, focus on',
        recommendation: 'Consistent practice in your weakest areas',
        actionLabel: 'Start Session',
        action: 'start_session',
        priority: 'default',
      };
    };

    const actionableFocus = generateActionableFocus();
    // 6. Generate AI Summary with specific, data-driven prompt
    const summaryText = await this.brain.generateWeeklySummary(userId, {
      sessions: thisWeekSessions.length,
      avgScore: avgOverall,
      lastWeekAvgScore: lastWeekAvg,
      avgScoreDelta,
      skillBreakdown: {
        grammar: {
          score: avgSkills.grammar,
          errorCount: thisWeekStats.totalErrors,
          topErrorType,
          delta: skillDeltas.grammar,
        },
        pronunciation: {
          score: avgSkills.pronunciation,
          problemSounds: Array.from(thisWeekStats.problemSounds).slice(0, 3),
          delta: skillDeltas.pronunciation,
        },
        fluency: {
          score: avgSkills.fluency,
          fillerWordCount: avgFillerWords,
          avgWPM,
          delta: skillDeltas.fluency,
        },
        vocabulary: {
          score: avgSkills.vocabulary,
          newWordsUsed: thisWeekStats.newWordsUsed.size,
          wordsToReview: thisWeekStats.wordsToReview.size,
          delta: skillDeltas.vocabulary,
        },
      },
      strongestSkill,
      weakestSkill,
      mostImprovedSkill,
      mostImprovedDelta,
      biggestDropSkill,
      biggestDropAmount,
      actionableFocus,
    });

    // 7. Check for edge cases and return structured data
    const isPerfectWeek = avgOverall >= 95;
    const isScoreDropAcrossAll = Object.values(skillDeltas).every(
      (delta) => delta < -3,
    );

    let edgeCase = null;
    let adjustedText = summaryText;

    if (isPerfectWeek) {
      edgeCase = 'perfect_scores';
      adjustedText = `You scored 100 in ${strongestSkill.charAt(0).toUpperCase() + strongestSkill.slice(1)} — time to push ${weakestSkill.charAt(0).toUpperCase() + weakestSkill.slice(1)} from ${avgSkills[weakestSkill]} toward 90.`;
    } else if (isScoreDropAcrossAll) {
      edgeCase = 'score_drop_all';
      adjustedText = `Scores dipped this week — that's normal after a break. Your strongest starting point is ${strongestSkill.charAt(0).toUpperCase() + strongestSkill.slice(1)} at ${avgSkills[strongestSkill]}.`;
    }

    return {
      type: 'weekly_summary',
      priority: 2,
      data: {
        text: adjustedText,
        sessionsCount: thisWeekSessions.length,
        avgScore: avgOverall,
        lastWeekAvgScore: lastWeekAvg,
        skillBreakdown: {
          grammar: {
            score: avgSkills.grammar,
            delta: skillDeltas.grammar,
            errorCount: thisWeekStats.totalErrors,
            topErrorType,
          },
          pronunciation: {
            score: avgSkills.pronunciation,
            delta: skillDeltas.pronunciation,
            problemSounds: Array.from(thisWeekStats.problemSounds).slice(0, 3),
          },
          fluency: {
            score: avgSkills.fluency,
            delta: skillDeltas.fluency,
            fillerWordCount: avgFillerWords,
            avgWPM,
          },
          vocabulary: {
            score: avgSkills.vocabulary,
            delta: skillDeltas.vocabulary,
            newWordsUsed: thisWeekStats.newWordsUsed.size,
            wordsToReview: thisWeekStats.wordsToReview.size,
          },
        },
        actionableFocus,
        edgeCase,
        highlights: [], // Remove generic highlights, replaced by actionable focus
        streakDays: 0, // TODO: Calculate from user activity
        bestSession: {
          date: thisWeekSessions[0]?.session?.startedAt,
          score: Math.max(
            ...thisWeekSessions.map(
              (s) => (s.analysis?.scores as any)?.overall || 0,
            ),
          ),
        },
      },
    };
  }
}
