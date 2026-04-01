export interface ConversationSession {
    id: string;
    topic?: string;
    structure?: string;
    objectives?: any; // JSON
    checkpoints?: any; // JSON
    status: 'CREATED' | 'IN_PROGRESS' | 'ENDED' | 'PROCESSING' | 'COMPLETED' | 'ANALYSIS_FAILED';
    startedAt: string;
    endedAt?: string;
    duration?: number;
    interactionMetrics?: any;
    peerComparison?: any;
    createdAt: string;
    updatedAt: string;
    participants: SessionParticipant[];
}

export interface SessionParticipant {
    id: string;
    sessionId: string;
    userId: string;
    audioUrl?: string;
    speakingTime: number;
    turnsTaken: number;
    lastHeartbeat: string;
}

export interface MatchmakingRequest {
    userId: string;
    structure: string;
    strategy: 'strict' | 'medium' | 'relaxed';
}

export interface MatchmakingResponse {
    status: 'matched' | 'waiting' | 'timeout';
    sessionId?: string;
    partner?: {
        id: string;
        name: string;
        level: number;
        tier: string;
    };
    estimatedWaitTime?: number;
}

export interface BookingSlot {
    id: string;
    tutorName: string;
    tutorAvatar?: string;
    startTime: string;
    endTime: string;
    creditsRequired: number;
}

export interface BookingPayload {
    slotId: string;
    tutorId?: string;
    startTime: string;
}

export interface BookingResult {
    success: boolean;
    bookingId?: string;
    message?: string;
    noCredits?: boolean;
}
