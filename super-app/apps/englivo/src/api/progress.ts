import { client } from "./client";

export interface PerformanceHistory {
  weeks: Array<{
    weekLabel: string;
    days: number[];
    avgFluency: number;
  }>;
  streak: number;
  totalHours: number;
  fluencyTrend: number[];
}

export async function getPerformanceHistory(): Promise<PerformanceHistory> {
  try {
    const r = await client.get<PerformanceHistory>("/api/performance/history");
    return r.data;
  } catch (e) {
    console.error("[Englivo API] getPerformanceHistory failed:", e);
    throw e;
  }
}
