import { client as sessionClient } from "../englivoClient";

export interface PerformanceHistory {
  streak: number;
  totalHours: number;
  // Add other fields as needed
}

export async function getPerformanceHistory(): Promise<PerformanceHistory> {
  try {
    const r = await sessionClient.get("/api/progress/detailed-metrics");
    console.log('[Progress API] Response:', r.data);
    // Map the response to our expected format
    return {
      streak: r.data?.streak ?? 0,
      totalHours: r.data?.totalSessions ? r.data.totalSessions * 0.5 : 0, // Estimate ~30min per session
    };
  } catch (error) {
    console.warn('[Progress API] Failed to fetch performance history:', error);
    // Return default values on error
    return {
      streak: 0,
      totalHours: 0,
    };
  }
}
