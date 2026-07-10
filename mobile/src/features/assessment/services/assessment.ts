import { client, aiClient } from "../../../api/client";
import type { FluencyBreakdown } from "../../../types/fluency";
import type { DeliveryInsight } from "../../../types/delivery";

export interface AssessmentResult {
  assessmentId: string;
  status: string;
  overallLevel: string;
  overallScore: number;
  confidence: number;
  skillBreakdown: any;
  fluencyBreakdown?: FluencyBreakdown | null;
  deliveryInsights?: DeliveryInsight[] | null;
  rawAzureMetrics?: { fluency?: number; prosody?: number };
  weaknessMap: any[];
  improvementDelta: any;
  personalizedPlan: any;
  benchmarking: any;
  readiness: any;
  confidence_metrics: any;
  recurring_errors: any[];
  detailedReport: any;
  nextAssessmentAvailableAt: string;
}

export const assessmentApi = {
  startAssessment: async () => {
    // No userId needed — backend extracts it from the auth token
    const response = await client.post("/assessment/start");
    return response.data;
  },

  submitPhase: async (
    assessmentId: string,
    phase: string,
    audioBase64: string,
    attempt: number = 1,
  ) => {
    const response = await aiClient.post("/assessment/submit", {
      assessmentId,
      phase,
      audioBase64,
      attempt,
    }, { timeout: 120000 });
    return response.data;
  },

  getDashboard: async () => {
    // No userId needed — backend extracts it from the auth token
    const response = await client.get("/assessment/dashboard");
    return response.data;
  },

  getResults: async (assessmentId: string) => {
    const response = await client.get(`/assessment/${assessmentId}/results`);
    return response.data;
  },
};
