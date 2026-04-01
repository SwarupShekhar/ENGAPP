export interface User {
  id: string;
  clerkId: string;
  firstName: string;
  lastName?: string;
  email: string;
  cefrLevel: string;
  nativeLanguage?: string;
  streakDays: number;
  totalSessions: number;
  totalMinutes: number;
  createdAt: string;
}

export interface SessionHistory {
  id: string;
  type: "AI" | "HUMAN";
  durationMinutes: number;
  score?: number;
  cefrLevel?: string;
  createdAt: string;
  summary?: string;
}
