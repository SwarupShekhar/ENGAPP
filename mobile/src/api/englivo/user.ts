import { client } from "../englivoClient";
import { SessionHistory, User } from "../../types/user";

export async function getMe(): Promise<User> {
  try {
    const r = await client.get<User>("/api/me");
    return r.data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      // Local backend-ai does not expose /api/me in current setup.
      return {
        id: "",
        clerkId: "",
        firstName: "Learner",
        email: "",
        cefrLevel: "A1",
        streakDays: 0,
        totalSessions: 0,
        totalMinutes: 0,
        createdAt: new Date().toISOString(),
        credits: 0,
      };
    }
    throw err;
  }
}

export async function getHistory(): Promise<SessionHistory[]> {
  try {
    const r = await client.get<any>("/api/history");
    const raw = r.data;
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.history)) return raw.history;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
  } catch (err: any) {
    if (err?.response?.status === 404) return [];
    throw err;
  }
}

export async function getCefrPath(): Promise<{ levels: string[]; current: string }> {
  const r = await client.get<{ levels: string[]; current: string }>(
    "/api/user/cefr-path",
  );
  return r.data;
}
