import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { isScoreAuthorityEnabled } from './score-authority.config';
import {
  PillarScores,
  applyAssessmentGating,
  clampScore,
  computeGoalProgress,
  computeOverall,
  deriveCefrFromOverall,
  flattenSkillBreakdown,
} from './score-authority.formulas';

export interface PillarDeltas {
  pronunciation: number;
  fluency: number;
  grammar: number;
  vocabulary: number;
  comprehension: number;
}

export type ScoreEventType =
  | 'assessment_seed'
  | 'call_delta'
  | 'maya_delta'
  | 'backfill';

export interface ScoreProfileResponse {
  overall: number;
  cefrLevel: string;
  pillars: PillarScores;
  vocabularyMeasured: boolean;
  goal: { label: string; targetScore: number; progressPercent: number };
  deltas: { since: string; pillars: Partial<PillarScores>; overall?: number };
  baselineAssessmentId: string | null;
  lastEventType: string | null;
  updatedAt: Date | null;
}

const EMPTY_PROFILE: ScoreProfileResponse = {
  overall: 0,
  cefrLevel: 'A1',
  pillars: {
    pronunciation: 0,
    fluency: 0,
    grammar: 0,
    vocabulary: 0,
    comprehension: 0,
  },
  vocabularyMeasured: false,
  goal: { label: 'Reach A2', targetScore: 55, progressPercent: 0 },
  deltas: { since: 'last_session', pillars: {}, overall: 0 },
  baselineAssessmentId: null,
  lastEventType: null,
  updatedAt: null,
};

type ProfileSnapshot = {
  overall: number;
  cefrLevel: string;
  pillars: PillarScores;
  vocabularyMeasured: boolean;
};

@Injectable()
export class ScoreAuthorityService {
  private readonly logger = new Logger(ScoreAuthorityService.name);

  constructor(private readonly prisma: PrismaService) {}

  isEnabled(userId?: string): boolean {
    return isScoreAuthorityEnabled(userId);
  }

  isEnabledForUser(userId: string): boolean {
    return isScoreAuthorityEnabled(userId);
  }

  async toDetailedMetricsCurrent(userId: string) {
    const profile = await this.getProfile(userId);
    return {
      pronunciation: profile.pillars.pronunciation,
      fluency: profile.pillars.fluency,
      grammar: profile.pillars.grammar,
      vocabulary: profile.pillars.vocabulary,
      comprehension: profile.pillars.comprehension,
      overallScore: profile.overall,
      cefrLevel: profile.cefrLevel,
    };
  }

  async getProfile(userId: string): Promise<ScoreProfileResponse> {
    const profile = await this.prisma.userScoreProfile.findUnique({
      where: { userId },
    });
    if (!profile) return { ...EMPTY_PROFILE };

    const pillars: PillarScores = {
      pronunciation: profile.pronunciation,
      fluency: profile.fluency,
      grammar: profile.grammar,
      vocabulary: profile.vocabulary,
      comprehension: profile.comprehension,
    };

    const lastLog = await this.prisma.scoreChangeLog.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const deltaPillars: Partial<PillarScores> = {};
    let overallDelta = 0;
    if (lastLog?.before && lastLog?.after) {
      const before = lastLog.before as ProfileSnapshot;
      const after = lastLog.after as ProfileSnapshot;
      overallDelta = (after.overall ?? 0) - (before.overall ?? 0);
      for (const key of Object.keys(pillars) as (keyof PillarScores)[]) {
        const diff =
          (after.pillars?.[key] ?? 0) - (before.pillars?.[key] ?? 0);
        if (diff !== 0) {
          deltaPillars[key] = Math.round(diff);
        }
      }
    }

    return {
      overall: profile.overallScore,
      cefrLevel: profile.cefrLevel,
      pillars,
      vocabularyMeasured: profile.vocabularyMeasured,
      goal: computeGoalProgress(profile.overallScore, profile.cefrLevel),
      deltas: {
        since: 'last_session',
        pillars: deltaPillars,
        overall: overallDelta,
      },
      baselineAssessmentId: profile.baselineAssessmentId,
      lastEventType: profile.lastEventType,
      updatedAt: profile.updatedAt,
    };
  }

  async seedFromAssessment(
    params: {
      userId: string;
      assessmentId: string;
      skillBreakdown: unknown;
      comprehensionScore?: number;
      force?: boolean;
      eventType?: ScoreEventType;
    },
  ): Promise<{ overall: number; cefrLevel: string; pillars: PillarScores } | null>;
  async seedFromAssessment(
    userId: string,
    assessmentId: string,
  ): Promise<{ overall: number; cefrLevel: string; pillars: PillarScores } | null>;
  async seedFromAssessment(
    userIdOrParams:
      | string
      | {
          userId: string;
          assessmentId: string;
          skillBreakdown: unknown;
          comprehensionScore?: number;
          force?: boolean;
          eventType?: ScoreEventType;
        },
    assessmentId?: string,
  ) {
    if (typeof userIdOrParams === 'string') {
      const session = await this.prisma.assessmentSession.findUnique({
        where: { id: assessmentId! },
        select: {
          skillBreakdown: true,
          phase4Data: true,
        },
      });
      if (!session) return null;
      const p4 = session.phase4Data as { comprehensionScore?: number } | null;
      return this.seedFromAssessment({
        userId: userIdOrParams,
        assessmentId: assessmentId!,
        skillBreakdown: session.skillBreakdown,
        comprehensionScore: p4?.comprehensionScore,
      });
    }

    const params = userIdOrParams;
    const { userId, assessmentId: assessId, skillBreakdown } = params;
    if (!params.force && !isScoreAuthorityEnabled(userId)) {
      return null;
    }

    const pillars = flattenSkillBreakdown(skillBreakdown);
    if (params.comprehensionScore != null) {
      pillars.comprehension = clampScore(params.comprehensionScore);
    }

    let overall = computeOverall(pillars);
    overall = applyAssessmentGating(pillars, overall);
    const cefrLevel = deriveCefrFromOverall(overall);
    const vocabularyMeasured =
      pillars.vocabulary > 0 ||
      (typeof skillBreakdown === 'object' &&
        skillBreakdown !== null &&
        'vocabulary' in (skillBreakdown as object));

    const before = await this.snapshotForUser(userId);
    const eventType = params.eventType ?? 'assessment_seed';

    await this.persistProfile({
      userId,
      pillars,
      overall,
      cefrLevel,
      vocabularyMeasured,
      baselineAssessmentId: assessId,
      lastEventType: eventType,
      lastSessionId: null,
      pendingCefrLevel: null,
      cefrStableCount: 0,
    });

    const after = this.buildSnapshot(
      overall,
      cefrLevel,
      pillars,
      vocabularyMeasured,
    );
    await this.logChange({
      userId,
      eventType,
      assessmentId: assessId,
      before,
      after,
    });

    this.logger.log(
      `[authority] ${eventType} user=${userId} assessment=${assessId} overall=${overall} cefr=${cefrLevel}`,
    );

    return { overall, cefrLevel, pillars };
  }

  async applySessionDeltas(
    userId: string,
    deltas: PillarDeltas,
    eventType: 'call_delta' | 'maya_delta' | 'backfill' = 'call_delta',
    sessionId?: string,
    options?: { force?: boolean },
  ) {
    if (!options?.force && !isScoreAuthorityEnabled(userId)) {
      return null;
    }

    const profile = await this.prisma.userScoreProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      this.logger.warn(
        `[authority] ${eventType} skipped — no profile for user=${userId}`,
      );
      return null;
    }

    const oldPillars: PillarScores = {
      pronunciation: profile.pronunciation,
      fluency: profile.fluency,
      grammar: profile.grammar,
      vocabulary: profile.vocabulary,
      comprehension: profile.comprehension,
    };

    const newPillars: PillarScores = {
      pronunciation: clampScore(
        oldPillars.pronunciation + (deltas.pronunciation || 0),
      ),
      fluency: clampScore(oldPillars.fluency + (deltas.fluency || 0)),
      grammar: clampScore(oldPillars.grammar + (deltas.grammar || 0)),
      vocabulary: clampScore(
        oldPillars.vocabulary + (deltas.vocabulary || 0),
      ),
      comprehension: clampScore(
        oldPillars.comprehension + (deltas.comprehension || 0),
      ),
    };

    const overall = computeOverall(newPillars);
    const hysteresis = this.resolveCefrWithHysteresis(
      profile.cefrLevel,
      profile.pendingCefrLevel,
      profile.cefrStableCount,
      overall,
      false,
    );

    const vocabularyMeasured =
      profile.vocabularyMeasured || newPillars.vocabulary > 0;

    const before = this.buildSnapshot(
      profile.overallScore,
      profile.cefrLevel,
      oldPillars,
      profile.vocabularyMeasured,
    );

    await this.persistProfile({
      userId,
      pillars: newPillars,
      overall,
      cefrLevel: hysteresis.cefrLevel,
      vocabularyMeasured,
      baselineAssessmentId: profile.baselineAssessmentId,
      lastEventType: eventType,
      lastSessionId: sessionId ?? profile.lastSessionId,
      pendingCefrLevel: hysteresis.pendingCefrLevel,
      cefrStableCount: hysteresis.cefrStableCount,
    });

    const after = this.buildSnapshot(
      overall,
      hysteresis.cefrLevel,
      newPillars,
      vocabularyMeasured,
    );
    await this.logChange({
      userId,
      eventType,
      sessionId,
      before,
      after,
    });

    return {
      success: true,
      userId,
      oldScores: { ...oldPillars, overallScore: profile.overallScore },
      newScores: { ...newPillars, overallScore: overall },
      isGatingActive: false,
      appliedAt: new Date(),
    };
  }

  resolveCefrWithHysteresis(
    currentCefr: string,
    pendingCefr: string | null,
    stableCount: number,
    newOverall: number,
    resetHysteresis: boolean,
  ): {
    cefrLevel: string;
    pendingCefrLevel: string | null;
    cefrStableCount: number;
  } {
    const rawCefr = deriveCefrFromOverall(newOverall);

    if (resetHysteresis) {
      return {
        cefrLevel: rawCefr,
        pendingCefrLevel: null,
        cefrStableCount: 0,
      };
    }

    if (rawCefr === currentCefr) {
      return {
        cefrLevel: currentCefr,
        pendingCefrLevel: null,
        cefrStableCount: 0,
      };
    }

    if (pendingCefr === rawCefr) {
      const newCount = stableCount + 1;
      if (newCount >= 2) {
        return {
          cefrLevel: rawCefr,
          pendingCefrLevel: null,
          cefrStableCount: 0,
        };
      }
      return {
        cefrLevel: currentCefr,
        pendingCefrLevel: rawCefr,
        cefrStableCount: newCount,
      };
    }

    return {
      cefrLevel: currentCefr,
      pendingCefrLevel: rawCefr,
      cefrStableCount: 1,
    };
  }

  private async snapshotForUser(userId: string): Promise<ProfileSnapshot | null> {
    const profile = await this.prisma.userScoreProfile.findUnique({
      where: { userId },
    });
    if (!profile) return null;
    return this.buildSnapshot(
      profile.overallScore,
      profile.cefrLevel,
      {
        pronunciation: profile.pronunciation,
        fluency: profile.fluency,
        grammar: profile.grammar,
        vocabulary: profile.vocabulary,
        comprehension: profile.comprehension,
      },
      profile.vocabularyMeasured,
    );
  }

  private buildSnapshot(
    overall: number,
    cefrLevel: string,
    pillars: PillarScores,
    vocabularyMeasured: boolean,
  ): ProfileSnapshot {
    return { overall, cefrLevel, pillars, vocabularyMeasured };
  }

  private async persistProfile(data: {
    userId: string;
    pillars: PillarScores;
    overall: number;
    cefrLevel: string;
    vocabularyMeasured: boolean;
    baselineAssessmentId: string | null;
    lastEventType: string;
    lastSessionId: string | null;
    pendingCefrLevel: string | null;
    cefrStableCount: number;
  }) {
    const {
      userId,
      pillars,
      overall,
      cefrLevel,
      vocabularyMeasured,
      baselineAssessmentId,
      lastEventType,
      lastSessionId,
      pendingCefrLevel,
      cefrStableCount,
    } = data;

    await this.prisma.$transaction([
      this.prisma.userScoreProfile.upsert({
        where: { userId },
        create: {
          userId,
          overallScore: overall,
          cefrLevel,
          pronunciation: pillars.pronunciation,
          fluency: pillars.fluency,
          grammar: pillars.grammar,
          vocabulary: pillars.vocabulary,
          comprehension: pillars.comprehension,
          vocabularyMeasured,
          baselineAssessmentId,
          lastEventType,
          lastSessionId,
          pendingCefrLevel,
          cefrStableCount,
        },
        update: {
          overallScore: overall,
          cefrLevel,
          pronunciation: pillars.pronunciation,
          fluency: pillars.fluency,
          grammar: pillars.grammar,
          vocabulary: pillars.vocabulary,
          comprehension: pillars.comprehension,
          vocabularyMeasured,
          baselineAssessmentId,
          lastEventType,
          lastSessionId,
          pendingCefrLevel,
          cefrStableCount,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          assessmentScore: overall,
          overallLevel: cefrLevel,
          levelUpdatedAt: new Date(),
        },
      }),
      ...Object.entries(pillars).map(([pillar, score]) =>
        this.prisma.userTopicScore.upsert({
          where: {
            userId_topicTag: { userId, topicTag: `pillar_${pillar}` },
          },
          create: { userId, topicTag: `pillar_${pillar}`, score },
          update: { score },
        }),
      ),
    ]);
  }

  private async logChange(params: {
    userId: string;
    eventType: string;
    assessmentId?: string;
    sessionId?: string;
    before: ProfileSnapshot | null;
    after: ProfileSnapshot;
  }) {
    await this.prisma.scoreChangeLog.create({
      data: {
        userId: params.userId,
        eventType: params.eventType,
        assessmentId: params.assessmentId,
        sessionId: params.sessionId,
        before: params.before as object | undefined,
        after: params.after as object,
      },
    });
  }
}
