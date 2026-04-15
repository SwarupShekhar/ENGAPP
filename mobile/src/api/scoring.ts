import { client as apiClient } from './client';

export interface PreviewData {
  status: 'strong' | 'good' | 'needs_work' | 'neutral';
  signal: number;
  hint: string;
}

export const getCallPreview = async (userTurnsSoFar: string[]): Promise<PreviewData> => {
  try {
    const res = await apiClient.post('/api/scoring/preview', {
      user_turns_so_far: userTurnsSoFar,
    });
    return res.data;
  } catch (e) {
    console.warn('Failed to fetch call preview:', e);
    return { status: 'neutral', signal: 0, hint: 'Preview unavailable' };
  }
};

export interface CQSResults {
  cqs: number;
  breakdown: {
    pqs: number;
    ds: number;
    cs: number;
    es: number;
  };
}

export const getCQSScore = async (sessionId: string): Promise<CQSResults | null> => {
  try {
    const res = await apiClient.get(`/api/scoring/session/${sessionId}`);
    const raw = res.data;
    if (!raw) return null;

    // Backend returns a flat CallQualityScore record:
    // { cqs, pqs, depthScore, complexityScore, engagementScore, ... }
    // Mobile UI expects nested: { cqs, breakdown: { pqs, ds, cs, es } }
    const breakdownRaw = raw.breakdown;

    const toNumber = (v: unknown): number => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const cqs = toNumber(raw.cqs);

    const pqs = breakdownRaw
      ? toNumber((breakdownRaw as any).pqs)
      : toNumber(raw.pqs);

    const ds = breakdownRaw
      ? toNumber((breakdownRaw as any).ds ?? (breakdownRaw as any).depthScore)
      : toNumber(raw.depthScore);

    const cs = breakdownRaw
      ? toNumber((breakdownRaw as any).cs ?? (breakdownRaw as any).complexityScore)
      : toNumber(raw.complexityScore);

    const es = breakdownRaw
      ? toNumber((breakdownRaw as any).es ?? (breakdownRaw as any).engagementScore)
      : toNumber(raw.engagementScore);

    return {
      cqs,
      breakdown: { pqs, ds, cs, es },
    };
  } catch (e) {
    console.error('Failed to fetch CQS score:', e);
    return null;
  }
};
