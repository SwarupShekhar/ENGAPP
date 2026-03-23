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
    return res.data;
  } catch (e) {
    console.error('Failed to fetch CQS score:', e);
    return null;
  }
};
