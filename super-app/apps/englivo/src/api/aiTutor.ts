import { client } from "./client";
import { TranscribeResponse, FluencyAnalysis, SessionReport } from "../types/aiTutor";

export async function transcribeAudio(formData: any): Promise<TranscribeResponse> {
  try {
    const r = await client.post<TranscribeResponse>("/api/deepgram", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return r.data;
  } catch (e) {
    console.error("[Englivo API] transcribeAudio failed:", e);
    throw e;
  }
}

export async function analyzeFluency(payload: any): Promise<FluencyAnalysis> {
  try {
    const r = await client.post<FluencyAnalysis>(
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
    const r = await client.post<{ reply: string; audioBase64?: string }>(
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
    const r = await client.post<{ audioBase64: string }>("/api/tts", payload);
    return r.data;
  } catch (e) {
    console.error("[Englivo API] textToSpeech failed:", e);
    throw e;
  }
}

export async function generateReport(payload: any): Promise<SessionReport> {
  try {
    const r = await client.post<SessionReport>(
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
    const r = await client.post<{ id: string }>("/api/ai-tutor/save", payload);
    return r.data;
  } catch (e) {
    console.error("[Englivo API] saveSession failed:", e);
    throw e;
  }
}
