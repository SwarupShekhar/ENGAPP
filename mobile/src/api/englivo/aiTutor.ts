import { client } from "../englivoClient";
import { FluencyAnalysis, SessionReport, TranscribeResponse } from "../../types/aiTutor";

export async function transcribeAudio(formData: any): Promise<TranscribeResponse> {
  const r = await client.post<TranscribeResponse>("/api/deepgram", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return r.data;
}

export async function analyzeFluency(payload: any): Promise<FluencyAnalysis> {
  const r = await client.post<FluencyAnalysis>("/api/fluency/analyze", payload);
  return r.data;
}

export async function sendMessage(payload: any): Promise<{
  reply: string;
  audioBase64?: string;
}> {
  const r = await client.post<{ reply: string; audioBase64?: string }>(
    "/api/ai",
    payload,
  );
  return r.data;
}

export async function textToSpeech(payload: any): Promise<{ audioBase64: string }> {
  const r = await client.post<{ audioBase64: string }>("/api/tts", payload);
  return r.data;
}

export async function generateReport(payload: any): Promise<SessionReport> {
  const r = await client.post<SessionReport>("/api/ai-tutor/report", payload);
  return r.data;
}

export async function saveSession(payload: any): Promise<{ id: string }> {
  const r = await client.post<{ id: string }>("/api/ai-tutor/save", payload);
  return r.data;
}
