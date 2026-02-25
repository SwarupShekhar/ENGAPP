import { Injectable } from '@nestjs/common';

export interface ScoreBreakdown {
  pronunciation: number;
  fluency: number;
  grammar: number;
  vocabulary: number;
}

export interface ReadinessAssessment {
  canDo: string[];
  mayStruggleWith: string[];
  careerGoalAlignment: {
    current: string;
    target: string;
    gap: number;
    estimatedTimeToTarget: string;
  };
}

@Injectable()
export class ReadinessService {
  getReadinessAssessment(
    overallScore: number,
    cefr: string,
    breakdown: ScoreBreakdown,
    userGoal: string = 'international_engineering_role',
  ): ReadinessAssessment {
    const abilities = this.getAbilitiesByCEFR(cefr, breakdown);
    const struggles = this.getStrugglesByCEFR(cefr, breakdown);

    const goalAlignment = this.assessGoalAlignment(
      userGoal,
      overallScore,
      cefr,
    );

    return {
      canDo: abilities,
      mayStruggleWith: struggles,
      careerGoalAlignment: goalAlignment,
    };
  }

  private getAbilitiesByCEFR(
    cefr: string,
    breakdown: ScoreBreakdown,
  ): string[] {
    const baseAbilities: Record<string, string[]> = {
      A1: [
        'Introduce yourself simply',
        'Ask and answer basic personal questions',
      ],
      A2: [
        'Handle simple, routine tasks',
        'Describe your background and environment',
      ],
      B1: [
        'Present technical concepts clearly',
        'Participate in team discussions',
        'Understand engineering documentation',
        'Write technical emails',
        'Follow presentations on familiar topics',
      ],
      B2: [
        'Lead technical meetings',
        'Negotiate with clients/vendors',
        'Give formal presentations',
        'Understand complex technical arguments',
        'Write detailed technical reports',
      ],
      C1: [
        'Present at international conferences',
        'Handle difficult negotiations',
        'Write research papers',
        'Understand rapid native speech',
        'Use idiomatic language naturally',
      ],
      C2: [
        'Express yourself precisely in complex situations',
        'Master nuanced communication',
      ],
    };

    const abilities = baseAbilities[cefr] || baseAbilities['B1'];

    // Filter based on weak areas
    return abilities.filter((ability) => {
      // If pronunciation is weak, remove "presentations" or "discussions"
      if (
        breakdown.pronunciation < 60 &&
        (ability.includes('present') || ability.includes('discussion'))
      ) {
        return false;
      }
      // If grammar is weak, remove "writing" or "reports"
      if (
        breakdown.grammar < 60 &&
        (ability.includes('write') || ability.includes('report'))
      ) {
        return false;
      }
      return true;
    });
  }

  private getStrugglesByCEFR(
    cefr: string,
    breakdown: ScoreBreakdown,
  ): string[] {
    const struggles = [];
    if (breakdown.pronunciation < 65)
      struggles.push('Clarity in high-stress meetings');
    if (breakdown.fluency < 65)
      struggles.push('Natural flow in fast-paced debates');
    if (breakdown.grammar < 65)
      struggles.push('Nuanced technical writing accuracy');
    if (cefr === 'B1') struggles.push('Complex abstract argumentation');
    if (cefr === 'B2') struggles.push('Subtle idiomatic nuances');

    return struggles.length > 0 ? struggles.slice(0, 3) : ['None identified'];
  }

  private assessGoalAlignment(
    userGoal: string,
    currentScore: number,
    currentCEFR: string,
  ) {
    const goalRequirements = {
      international_engineering_role: {
        minScore: 75,
        requiredCEFR: 'B2',
        description: 'International Engineering Role',
      },
      study_abroad: {
        minScore: 75,
        requiredCEFR: 'B2',
        description: 'Study Abroad Program',
      },
      ielts_7: {
        minScore: 80,
        requiredCEFR: 'C1',
        description: 'IELTS Band 7.0',
      },
    };

    const requirement =
      goalRequirements[userGoal] ||
      goalRequirements['international_engineering_role'];
    const gap = requirement.minScore - currentScore;

    // Estimate time based on typical improvement rate (2-3 points/week with practice)
    const weeksNeeded = Math.ceil(gap / 2.5);

    return {
      current: `${currentScore}/100 (${currentCEFR})`,
      target: `${requirement.minScore}/100 (${requirement.requiredCEFR})`,
      gap: Math.max(0, gap),
      estimatedTimeToTarget:
        gap <= 0
          ? "You're ready!"
          : `~${weeksNeeded} weeks with daily practice`,
    };
  }
}
