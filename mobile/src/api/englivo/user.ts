import { client } from "../englivoClient";
import { SessionHistory, User } from "../../types/user";

export async function getMe(): Promise<User> {
  const r = await client.get<User>("/api/me");
  return r.data;
}

export async function getHistory(): Promise<SessionHistory[]> {
  const r = await client.get<any>("/api/history");
  const raw = r.data;
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.history)) return raw.history;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

export async function getCefrPath(): Promise<{ levels: string[]; current: string }> {
  const r = await client.get<{ levels: string[]; current: string }>(
    "/api/user/cefr-path",
  );
  return r.data;
}
