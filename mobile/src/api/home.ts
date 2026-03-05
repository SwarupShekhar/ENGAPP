import client from "./client";

export interface HomeData {
  stage: number;
  header: {
    greeting: string;
    userName: string;
    level: string;
    score: number;
    streak: number;
    percentile: string | null;
    specialBadge: string | null;
    scoreDelta: string | null;
    goalTarget: number;
    goalLabel: string;
    lastSessionDate: string | null;
  };
  primaryCTA: {
    type: string;
    title: string;
    description: string;
    buttonText: string;
    action: string;
    accentColor: string;
    data?: any;
    mayaChip: {
      label: string;
      action: string;
    };
  };
  skills: {
    scores: Record<string, number>;
    deltas: Record<string, number>;
    deltaLabel: string;
    avgScore: number;
    avgDelta: number;
    hottestSkill: string;
    masteryFlags: Record<string, boolean> | null;
    trends: Record<string, number[]> | null;
  };
  contextualCards: Array<{
    type: string;
    priority: number;
    data: any;
  }>;
  weeklyActivity: number[];
}

export const getHomeData = async (): Promise<HomeData> => {
  const response = await client.get("/home");
  return response.data;
};
