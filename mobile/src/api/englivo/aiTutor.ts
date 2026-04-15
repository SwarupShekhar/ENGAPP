import * as FileSystem from "expo-file-system/legacy";
import { client } from "../englivoClient";
import type {
  AiTutorChatPayload,
  AiTutorReportPayload,
  AiTutorSavePayload,
  DeepgramJsonPayload,
  FluencyAnalysis,
  SessionReport,
  TranscribeResponse,
  TutorMessage,
} from "../../types/aiTutor";

/**
 * Englivo POST /api/deepgram expects JSON `{ audio: base64, mimeType }`, not multipart.
 * Use this for expo-av recordings (file URI after stop).
 */
export async function transcribeRecordingFromUri(
  uri: string,
  mimeType = "audio/m4a",
): Promise<TranscribeResponse> {
  const audio = await FileSystem.readAsStringAsync(uri, {
    encoding: "base64",
  });
  return transcribeAudioJson({ audio, mimeType });
}

/** @deprecated Englivo API rejects multipart; use transcribeRecordingFromUri. */
export async function transcribeAudio(
  formData: FormData,
): Promise<TranscribeResponse> {
  const r = await client.post<TranscribeResponse>("/api/deepgram", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return r.data;
}

/** JSON body (web parity): `{ audio: base64, mimeType }`. */
export async function transcribeAudioJson(
  payload: DeepgramJsonPayload,
): Promise<TranscribeResponse> {
  const r = await client.post<TranscribeResponse>("/api/deepgram", payload);
  return r.data;
}

export async function analyzeFluency(payload: unknown): Promise<FluencyAnalysis> {
  const r = await client.post<FluencyAnalysis>("/api/fluency/analyze", payload);
  return r.data;
}

/** Build POST /api/ai body (transcript + legacy message alias). */
function bodyForAiChat(payload: AiTutorChatPayload): Record<string, unknown> {
  const { transcript, message, ...rest } = payload;
  const t = transcript?.trim() || message?.trim() || "";
  return {
    ...rest,
    transcript: t,
    message: t,
  };
}

export async function sendMessage(
  payload: AiTutorChatPayload,
): Promise<{ reply: string; audioBase64?: string }> {
  const r = await client.post<{
    reply?: string;
    response?: string;
    audioBase64?: string;
  }>("/api/ai", bodyForAiChat(payload));
  const data = r.data;
  // Englivo API returns `response`; normalize to `reply` for internal use
  return {
    reply: data.reply ?? data.response ?? "",
    audioBase64: data.audioBase64,
  };
}

export async function textToSpeech(
  payload: { text: string },
): Promise<{ audioBase64: string }> {
  const r = await client.post<{ audioBase64?: string; audio?: string }>(
    "/api/tts",
    payload,
  );
  const data = r.data;
  // Englivo API returns `audio`; normalize to `audioBase64` for internal use
  return { audioBase64: data.audioBase64 ?? data.audio ?? "" };
}

/** GET /api/livekit/token?mode=ai — WebRTC token when using LiveKit for AI tutor (optional on RN). */
export async function fetchLiveKitAiToken(): Promise<{ token: string } | string> {
  const r = await client.get<{ token: string } | { url?: string }>(
    "/api/livekit/token",
    { params: { mode: "ai" } },
  );
  return r.data as { token: string };
}

/** Compile messages into a single transcript string + word count for /api/ai-tutor/report. */
export function buildAiTutorReportPayload(input: {
  sessionId: string;
  messages: { role: string; content: string }[];
  durationSeconds: number;
}): AiTutorReportPayload {
  const transcript = input.messages
    .map((m) => `${m.role === "user" ? "User" : "Englivo"}: ${m.content}`)
    .join("\n\n");
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  return {
    sessionId: input.sessionId,
    duration: input.durationSeconds,
    durationSeconds: input.durationSeconds,
    transcript,
    words,
    messages: input.messages,
  };
}

export async function generateReport(
  payload: AiTutorReportPayload | Record<string, unknown>,
): Promise<SessionReport> {
  const r = await client.post<SessionReport>(
    "/api/ai-tutor/report",
    payload,
  );
  return r.data;
}

export async function saveSession(
  payload: AiTutorSavePayload | Record<string, unknown>,
): Promise<{ id: string }> {
  const r = await client.post<{ id: string }>("/api/ai-tutor/save", payload);
  return r.data;
}

/** Convenience: map screen `TutorMessage[]` to chat payload for one turn. */
export function tutorMessagesToHistory(
  messages: TutorMessage[],
): { role: string; content: string }[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

export type {
  AiTutorChatPayload,
  AiTutorReportPayload,
  AiTutorSavePayload,
  DeepgramJsonPayload,
  FluencyAnalysis,
  SessionReport,
  TranscribeResponse,
} from "../../types/aiTutor";
