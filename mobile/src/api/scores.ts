import { client } from "./client";

export type ScoreProfile = {
  overall: number;
  cefrLevel: string;
  pillars: {
    fluency: number;
    grammar: number;
    pronunciation: number;
    vocabulary: number;
    comprehension: number;
  };
  vocabularyMeasured: boolean;
  goal: {
    label: string;
    targetScore: number;
    progressPercent: number;
  };
  deltas: {
    since: string;
    pillars: Partial<Record<string, number>>;
    overall?: number;
  } | null;
  baselineAssessmentId: string | null;
  lastEventType: string | null;
  updatedAt: string;
};

export async function getScoreProfile(): Promise<ScoreProfile | null> {
  try {
    const { data } = await client.get<ScoreProfile>("/scores/profile");
    return data ?? null;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 403) return null;
    if (__DEV__) console.warn("[scores] profile unavailable:", err);
    return null;
  }
}
