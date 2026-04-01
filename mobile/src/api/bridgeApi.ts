import { syncBridgeCefr } from "./bridgeClient";

export const bridgeApi = {
  async syncCefrLevel(payload: any): Promise<any> {
    try {
      return await syncBridgeCefr(payload);
    } catch (e) {
      const status = (e as any)?.response?.status;
      const message =
        (e as any)?.response?.data?.message ||
        (e as any)?.message ||
        "Unknown error";
      console.error(
        `[Bridge API] syncCefrLevel failed${status ? ` (${status})` : ""}: ${message}`,
      );
      throw e;
    }
  },
};

