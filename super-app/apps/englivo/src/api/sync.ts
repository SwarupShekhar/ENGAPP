import { bridgeApi } from "./client";

export async function syncCefrLevel(payload: any): Promise<any> {
  try {
    const r = await bridgeApi.patch<any>("/sync/cefr", payload);
    return r.data;
  } catch (e) {
    console.error("[Englivo Bridge API] syncCefrLevel failed:", e);
    throw e;
  }
}

