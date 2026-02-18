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
