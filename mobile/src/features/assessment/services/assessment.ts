import { client } from "./client";

export interface AssessmentResult {
  assessmentId: string;
  status: string;
  overallLevel: string;
  overallScore: number;
  confidence: number;
  skillBreakdown: any;
  fluencyBreakdown: any;
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
    const response = await client.post("/assessment/submit", {
      assessmentId,
      phase,
      audioBase64,
      attempt,
    });
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
