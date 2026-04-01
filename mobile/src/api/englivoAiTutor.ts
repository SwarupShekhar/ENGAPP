import { client as englivoClient } from "./englivoClient";

export type TranscribeResponse = {
  transcript: string;
  confidence?: number;
};

export type FluencyAnalysis = {
  fluencyScore: number;
  grammarErrors: string[];
  pronunciationErrors: string[];
  suggestions: string[];
};

export type SessionReport = {
  sessionId: string;
  durationMinutes: number;
  fluencyScore: number;
  grammarScore: number;
  pronunciationScore: number;
  vocabularyScore: number;
  cefrLevel: string;
  summary: string;
  improvements: string[];
};

export async function transcribeAudio(formData: any): Promise<TranscribeResponse> {
  try {
    const r = await englivoClient.post<TranscribeResponse>(
      "/api/deepgram",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return r.data;
  } catch (e) {
    console.error("[Englivo API] transcribeAudio failed:", e);
    throw e;
  }
}

export async function analyzeFluency(payload: any): Promise<FluencyAnalysis> {
  try {
    const r = await englivoClient.post<FluencyAnalysis>(
      "/api/fluency/analyze",
      payload,
    );
    return r.data;
  } catch (e) {
    console.error("[Englivo API] analyzeFluency failed:", e);
    throw e;
  }
}

export async function sendMessage(payload: any): Promise<{
  reply: string;
  audioBase64?: string;
}> {
  try {
    const r = await englivoClient.post<{ reply: string; audioBase64?: string }>(
      "/api/ai",
      payload,
    );
    return r.data;
  } catch (e) {
    console.error("[Englivo API] sendMessage failed:", e);
    throw e;
  }
}

export async function textToSpeech(payload: any): Promise<{ audioBase64: string }> {
  try {
    const r = await englivoClient.post<{ audioBase64: string }>(
      "/api/tts",
      payload,
    );
    return r.data;
  } catch (e) {
    console.error("[Englivo API] textToSpeech failed:", e);
    throw e;
  }
}

export async function generateReport(payload: any): Promise<SessionReport> {
  try {
    const r = await englivoClient.post<SessionReport>(
      "/api/ai-tutor/report",
      payload,
    );
    return r.data;
  } catch (e) {
    console.error("[Englivo API] generateReport failed:", e);
    throw e;
  }
}

export async function saveSession(payload: any): Promise<{ id: string }> {
  try {
    const r = await englivoClient.post<{ id: string }>(
      "/api/ai-tutor/save",
      payload,
    );
    return r.data;
  } catch (e) {
    console.error("[Englivo API] saveSession failed:", e);
    throw e;
  }
}

