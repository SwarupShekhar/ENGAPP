import { client } from "./client";
import { User, SessionHistory } from "../types/user";

export async function getMe(): Promise<User> {
  try {
    const r = await client.get<User>("/api/me");
    return r.data;
  } catch (e) {
    console.error("[Englivo API] getMe failed:", e);
    throw e;
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
  } catch (e) {
    console.error("[Englivo API] getHistory failed:", e);
    throw e;
  }
}

export async function getCefrPath(): Promise<{
  levels: string[];
  current: string;
}> {
  try {
    const r = await client.get<{ levels: string[]; current: string }>(
      "/api/user/cefr-path",
    );
    return r.data;
  } catch (e) {
    console.error("[Englivo API] getCefrPath failed:", e);
    throw e;
  }
}
