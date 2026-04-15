export interface UserReliability {
    id: string;
    userId: string;
    reliabilityScore: number;
    tier: 'bronze' | 'silver' | 'gold' | 'platinum';
    lastSessionAt?: string;
    consecutiveDrops: number;
    totalSessions: number;
    successfulSessions: number;
    createdAt: string;
    updatedAt: string;
}

export interface UserPoints {
    id: string;
    userId: string;
    total: number;
    level: number;
    updatedAt: string;
}

export interface UserProfile extends UserPoints {
    // Consolidated profile view if needed
    reliability?: UserReliability;
}

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
    /** Englivo /api/me may expose either naming for tutor credits. */
    credits?: number;
    creditBalance?: number;
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
