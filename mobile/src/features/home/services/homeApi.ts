import { client } from "../../../api/client";

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
    scoreDelta: number | null;
    dailyGoalDone: number;
    dailyGoalTarget: number;
    xpToday: number;
    goalTarget: number;
    goalLabel: string;
    lastSessionDate: string | null;
    latestAssessmentId: string | null;
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
      actionParam?: Record<string, string>;
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
    details: Record<string, { items: string[]; subtext: string }>;
  };
  contextualCards: Array<{
    type: string;
    priority: number;
    data: any;
    action?: string;
    actionParam?: Record<string, string>;
  }>;
  weeklyActivity: number[];
  wordOfTheDay?: {
    word: string;
    definition: string;
    example: string;
    partOfSpeech?: string | null;
    source?: string;
    listenAudio?: { Kiki?: string; Jasper?: string };
  };
  phraseOfTheDay?: {
    phrase: string;
    definition: string;
    example: string;
    source?: string;
    listenAudio?: { Kiki?: string; Jasper?: string };
  };
  listenVoicePreference?: {
    voice: 'Kiki' | 'Jasper';
    chosen: boolean;
  };
  dailyPracticeStatus?: {
    date: string;
    phrase: { done: boolean; completedAt?: string; bestScore?: number };
    word: { done: boolean; completedAt?: string; bestScore?: number };
  };
  community: {
    onlineCount: number;
    avatars: string[];
  };
}

export const getHomeData = async (): Promise<HomeData> => {
  const response = await client.get("/home");
  return response.data;
};
