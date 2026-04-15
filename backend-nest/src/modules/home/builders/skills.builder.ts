import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { UserStage } from '../services/stage-resolver.service';

@Injectable()
export class SkillsBuilder {
  constructor(private prisma: PrismaService) {}

  async buildSkillsData(userId: string, stage: UserStage) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return null;

    const totalSessions = user.totalSessions || 0;

    const latestAnalysis = await this.prisma.analysis.findFirst({
      where: { participant: { userId } },
      orderBy: { createdAt: 'desc' },
      include: {
        mistakes: true,
        pronunciationIssues: true,
      },
    });

    let currentScores = latestAnalysis?.scores as any;

    // Check if the latest analysis scores are actually useful (not all zeros)
    const isAllZero = (scores: any) => {
      if (!scores) return true;
      return (
        (scores.fluency || 0) === 0 &&
        (scores.grammar || 0) === 0 &&
        (scores.vocabulary || 0) === 0 &&
        (scores.pronunciation || 0) === 0
      );
    };

    if (!latestAnalysis || isAllZero(currentScores)) {
      const latestAssessment = await this.prisma.assessmentSession.findFirst({
        where: { userId, status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
      });

      if (latestAssessment && latestAssessment.skillBreakdown) {
        currentScores = this.flattenSkills(latestAssessment.skillBreakdown);
      } else {
        currentScores = {
          fluency: user.assessmentScore || 50,
          grammar: user.assessmentScore || 50,
          vocabulary: user.assessmentScore || 50,
          pronunciation: user.assessmentScore || 50,
        };
      }
    }

    // Process detailed insights for each skill
    const skillDetails = this.formatSkillDetails(latestAnalysis, currentScores);

    // Calculate deltas
    const deltas: any = {
      fluency: 0,
      grammar: 0,
      vocabulary: 0,
      pronunciation: 0,
    };
    let deltaLabel = '';

    if (totalSessions === 0) {
      deltaLabel = '';
    } else if (totalSessions >= 1 && totalSessions < 10) {
      // Delta from last session
      const previousAnalysis = await this.prisma.analysis.findFirst({
        where: { participant: { userId } },
        orderBy: { createdAt: 'desc' },
        skip: 1,
      });

      if (previousAnalysis) {
        const prevScores = previousAnalysis.scores as any;
        Object.keys(deltas).forEach((skill) => {
          deltas[skill] =
            (currentScores[skill] || 0) - (prevScores[skill] || 0);
        });
        deltaLabel = 'Since last session';
      }
    } else if (totalSessions >= 10) {
      // Delta from Day 1 assessment
      const initialAssessment = await this.prisma.assessmentSession.findFirst({
        where: { userId, status: 'COMPLETED' },
        orderBy: { completedAt: 'asc' },
      });

      if (initialAssessment && initialAssessment.skillBreakdown) {
        const initScores = this.flattenSkills(initialAssessment.skillBreakdown);
        Object.keys(deltas).forEach((skill) => {
          deltas[skill] =
            (currentScores[skill] || 0) - (initScores[skill] || 0);
        });
        deltaLabel = 'Since Day 1';
      }
    }

    // Calculate average
    const skillValues = Object.values(currentScores).filter(
      (v) => typeof v === 'number',
    ) as number[];
    const avgScore =
      skillValues.length > 0
        ? Math.round(
            skillValues.reduce((a, b) => a + b, 0) / skillValues.length,
          )
        : 0;

    const deltaValues = Object.values(deltas).filter(
      (v) => typeof v === 'number',
    ) as number[];
    const avgDelta =
      deltaValues.length > 0
        ? Math.round(
            deltaValues.reduce((a, b) => a + b, 0) / deltaValues.length,
          )
        : 0;

    // Determine hottest skill (biggest gain)
    const hottestSkill = Object.entries(deltas).sort(
      (a, b) => (b[1] as number) - (a[1] as number),
    )[0][0];

    // Mastery flags for C1+ users
    const masteryFlags =
      (user.assessmentScore || 0) >= 80
        ? {
            fluency: (currentScores.fluency || 0) >= 85,
            grammar: (currentScores.grammar || 0) >= 85,
            vocabulary: (currentScores.vocabulary || 0) >= 85,
            pronunciation: (currentScores.pronunciation || 0) >= 85,
          }
        : null;

    // Mini trends for 30+ sessions
    let trends = null;
    if (totalSessions >= 30) {
      trends = await this.calculateSkillTrends(userId);
    }

    return {
      scores: currentScores,
      deltas,
      deltaLabel,
      avgScore,
      avgDelta,
      hottestSkill,
      masteryFlags,
      trends,
      details: skillDetails,
    };
  }

  private formatSkillDetails(analysis: any, scores: any) {
    const details: Record<string, { items: string[]; subtext: string }> = {
      grammar: { items: [], subtext: 'Keep practicing!' },
      pronunciation: { items: [], subtext: 'Sounds good!' },
      fluency: { items: [], subtext: 'Nice flow!' },
      vocabulary: { items: [], subtext: 'Growing strong!' },
    };

    if (!analysis) {
      // Return helpful placeholders if no analysis exists
      details.grammar.items = [
        'Focus on subject-verb agreement',
        'Use varied tenses',
      ];
      details.pronunciation.items = [
        'Work on vowel clarity',
        'Practice word stress',
      ];
      details.fluency.items = ['Reduce filler words', 'Improve speech rate'];
      details.vocabulary.items = [
        'Learn 5 new idioms',
        'Use more precise verbs',
      ];
      return details;
    }

    // 1. Grammar & Vocabulary from Mistakes
    const mistakes = analysis.mistakes || [];
    const grammarMistakes = mistakes.filter((m: any) =>
      ['grammar', 'verb_form', 'syntax', 'article', 'general'].includes(m.type),
    );
    const vocabMistakes = mistakes.filter((m: any) =>
      ['vocabulary', 'word_choice', 'lexical'].includes(m.type),
    );

    if (grammarMistakes.length > 0) {
      details.grammar.items = grammarMistakes
        .slice(0, 2)
        .map((m: any) => `${m.original} \u2192 ${m.corrected}`);
      details.grammar.subtext = `${grammarMistakes.length} errors found`;
    } else if ((scores.grammar ?? 0) === 0) {
      details.grammar.items = [
        'No grammar score from your last analyzed session yet',
        'End a call and wait for analysis, or complete an assessment',
      ];
      details.grammar.subtext = 'No grammar data yet — not necessarily 0 mistakes';
    } else if (scores.grammar >= 85) {
      details.grammar.items = [
        'Excellent sentence structure',
        'Proper tense usage',
      ];
      details.grammar.subtext = 'Mastery level';
    } else {
      details.grammar.items = [
        'No major errors detected',
        'Clean sentence structure',
      ];
      details.grammar.subtext = 'Looking solid';
    }

    if (vocabMistakes.length > 0) {
      details.vocabulary.items = vocabMistakes
        .slice(0, 2)
        .map((m: any) => `${m.original} \u2192 ${m.corrected}`);
      details.vocabulary.subtext = `${vocabMistakes.length} improvements found`;
    } else {
      const topicVocab = analysis.topicVocabulary as any;
      if (topicVocab && topicVocab.relevant_terms?.length > 0) {
        details.vocabulary.items = topicVocab.relevant_terms
          .slice(0, 2)
          .map((t: any) => `Used: ${t}`);
        details.vocabulary.subtext = `${topicVocab.relevant_terms.length} key terms used`;
      } else {
        details.vocabulary.items = ['Good word choice', 'Appropriate register'];
        details.vocabulary.subtext = 'Strong range';
      }
    }

    // 2. Pronunciation from pronunciationIssues
    const pronIssues = analysis.pronunciationIssues || [];
    if (pronIssues.length > 0) {
      details.pronunciation.items = pronIssues
        .slice(0, 2)
        .map((i: any) => `Focus on: "${i.word}"`);
      details.pronunciation.subtext = `${pronIssues.length} sounds to refine`;
    } else if ((scores.pronunciation ?? 0) === 0) {
      details.pronunciation.items = [
        'Pronunciation score updates after your call is analyzed',
        'High scores can still appear before issues are listed',
      ];
      details.pronunciation.subtext = 'No pronunciation breakdown yet for this snapshot';
    } else if (scores.pronunciation >= 85) {
      details.pronunciation.items = [
        'Natural intonation',
        'Clear articulation',
      ];
      details.pronunciation.subtext = 'Near-native clarity';
    } else {
      details.pronunciation.items = [
        'Consistent clarity',
        'Clear vowel sounds',
      ];
      details.pronunciation.subtext = 'Clear delivery';
    }

    // 3. Fluency from hesitationMarkers or rawData
    const hesitations = analysis.hesitationMarkers as any;
    if (
      hesitations &&
      (hesitations.filler_words_count > 3 || hesitations.pauses_count > 2)
    ) {
      const fillers =
        hesitations.top_fillers?.slice(0, 1).join(', ') || 'fillers';
      details.fluency.items = [
        `Reduce "${fillers}" usage`,
        'Minimize long pauses',
      ];
      details.fluency.subtext = 'Work on flow';
    } else {
      const wpm = (analysis.rawData as any)?.azureEvidence?.wpm || 130;
      details.fluency.items = [
        `Speed: ${Math.round(wpm)} WPM (Ideal)`,
        'Few interruptions',
      ];
      details.fluency.subtext = 'Smooth delivery';
    }

    return details;
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
    };
  }

  private async calculateSkillTrends(userId: string) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const analyses = await this.prisma.analysis.findMany({
      where: {
        participant: { userId },
        createdAt: { gte: weekAgo },
      },
      orderBy: { createdAt: 'asc' },
    });

    const trends: Record<string, number[]> = {
      fluency: [],
      grammar: [],
      vocabulary: [],
      pronunciation: [],
    };

    analyses.forEach((analysis) => {
      const scores = analysis.scores as any;
      Object.keys(trends).forEach((skill) => {
        trends[skill].push(scores[skill] || 0);
      });
    });

    return trends;
  }
}
