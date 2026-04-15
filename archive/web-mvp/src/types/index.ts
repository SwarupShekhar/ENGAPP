export interface User {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    overallLevel: string;
}

export interface AssessmentSession {
    id: string;
    userId: string;
    status: 'IN_PROGRESS' | 'COMPLETED';
    overallScore?: number;
    overallLevel?: string;
    skillBreakdown?: any;
    weaknessMap?: any[];
    personalizedPlan?: any;
    detailedReport?: any;
    benchmark?: {
        averageScore: number;
        percentile: number;
        comparisonText: string;
    };
    nextAssessmentAvailableAt?: string;
}

export interface AnalysisResult {
    transcript: string;
    accuracyScore: number;
    fluencyScore: number;
    wordCount: number;
    detailedFeedback?: any;
    emotionData?: any;
}

export interface Question {
    id: string;
    text: string;
    level: string;
    type: string;
    imageUrl?: string;
}
