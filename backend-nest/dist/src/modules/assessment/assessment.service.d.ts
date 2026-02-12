import { AzureService } from '../azure/azure.service';
import { BrainService } from '../brain/brain.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AzureStorageService } from '../../integrations/azure-storage.service';
import { SubmitPhaseDto, AssessmentPhase } from './dto/assessment.dto';
export declare class AssessmentService {
    private readonly azure;
    private readonly brain;
    private readonly prisma;
    private readonly storage;
    private readonly logger;
    constructor(azure: AzureService, brain: BrainService, prisma: PrismaService, storage: AzureStorageService);
    startAssessment(userId: string): Promise<{
        id: string;
        overallLevel: string | null;
        talkStyle: import(".prisma/client").$Enums.TalkStyle | null;
        createdAt: Date;
        userId: string;
        status: import(".prisma/client").$Enums.AssessmentStatus;
        overallScore: number | null;
        confidence: number | null;
        skillBreakdown: import("@prisma/client/runtime/client").JsonValue | null;
        weaknessMap: import("@prisma/client/runtime/client").JsonValue | null;
        improvementDelta: import("@prisma/client/runtime/client").JsonValue | null;
        personalizedPlan: import("@prisma/client/runtime/client").JsonValue | null;
        phase1Data: import("@prisma/client/runtime/client").JsonValue | null;
        phase2Data: import("@prisma/client/runtime/client").JsonValue | null;
        phase3Data: import("@prisma/client/runtime/client").JsonValue | null;
        phase4Data: import("@prisma/client/runtime/client").JsonValue | null;
        completedAt: Date | null;
    }>;
    submitPhase(dto: SubmitPhaseDto): Promise<{
        hint: string;
        nextPhase: AssessmentPhase;
        nextSentence?: undefined;
    } | {
        nextPhase: AssessmentPhase;
        nextSentence: {
            text: string;
            level: string;
        };
        hint?: undefined;
    } | {
        nextPhase: AssessmentPhase;
        nextSentence: any;
        imageUrl?: undefined;
        imageLevel?: undefined;
    } | {
        nextPhase: AssessmentPhase;
        imageUrl: any;
        imageLevel: string;
        nextSentence?: undefined;
    } | {
        nextPhase: AssessmentPhase;
        question: string;
    } | {
        assessmentId: string;
        status: string;
        overallLevel: string;
        overallScore: number;
        talkStyle: import(".prisma/client").$Enums.TalkStyle;
        confidence: number;
        skillBreakdown: {
            pronunciation: {
                phonemeAccuracy: number;
                wordStress: number;
                connectedSpeech: number;
            };
            fluency: {
                speechRate: number;
                pauseFrequency: number;
                hesitationMarkers: number;
            };
            grammar: {
                tenseControl: number;
                sentenceComplexity: number;
                agreementErrors: number;
            };
            vocabulary: {
                lexicalRange: number;
                topicSpecificity: number;
                repetitionRate: number;
            };
        };
        weaknessMap: {
            area: string;
            severity: string;
        }[];
        improvementDelta: any;
        personalizedPlan: {
            dailyFocus: any[];
            weeklyGoal: string;
            recommendedExercises: string[];
        };
        nextAssessmentAvailableAt: Date;
    }>;
    private handlePhase1;
    private handlePhase2;
    private handlePhase3;
    private handlePhase4;
    calculateFinalLevel(assessmentId: string): Promise<{
        assessmentId: string;
        status: string;
        overallLevel: string;
        overallScore: number;
        talkStyle: import(".prisma/client").$Enums.TalkStyle;
        confidence: number;
        skillBreakdown: {
            pronunciation: {
                phonemeAccuracy: number;
                wordStress: number;
                connectedSpeech: number;
            };
            fluency: {
                speechRate: number;
                pauseFrequency: number;
                hesitationMarkers: number;
            };
            grammar: {
                tenseControl: number;
                sentenceComplexity: number;
                agreementErrors: number;
            };
            vocabulary: {
                lexicalRange: number;
                topicSpecificity: number;
                repetitionRate: number;
            };
        };
        weaknessMap: {
            area: string;
            severity: string;
        }[];
        improvementDelta: any;
        personalizedPlan: {
            dailyFocus: any[];
            weeklyGoal: string;
            recommendedExercises: string[];
        };
        nextAssessmentAvailableAt: Date;
    }>;
    private generateWeaknessMap;
    private generatePersonalizedPlan;
    getResults(id: string): Promise<{
        id: string;
        overallLevel: string | null;
        talkStyle: import(".prisma/client").$Enums.TalkStyle | null;
        createdAt: Date;
        userId: string;
        status: import(".prisma/client").$Enums.AssessmentStatus;
        overallScore: number | null;
        confidence: number | null;
        skillBreakdown: import("@prisma/client/runtime/client").JsonValue | null;
        weaknessMap: import("@prisma/client/runtime/client").JsonValue | null;
        improvementDelta: import("@prisma/client/runtime/client").JsonValue | null;
        personalizedPlan: import("@prisma/client/runtime/client").JsonValue | null;
        phase1Data: import("@prisma/client/runtime/client").JsonValue | null;
        phase2Data: import("@prisma/client/runtime/client").JsonValue | null;
        phase3Data: import("@prisma/client/runtime/client").JsonValue | null;
        phase4Data: import("@prisma/client/runtime/client").JsonValue | null;
        completedAt: Date | null;
    }>;
    getDashboardData(userId: string): Promise<{
        state: string;
        message: string;
        currentLevel?: undefined;
        overallScore?: undefined;
        improvementDelta?: undefined;
        skillBreakdown?: undefined;
        weaknessMap?: undefined;
        personalizedPlan?: undefined;
        nextAssessmentAvailableAt?: undefined;
    } | {
        state: string;
        currentLevel: string;
        overallScore: number;
        improvementDelta: import("@prisma/client/runtime/client").JsonValue;
        skillBreakdown: import("@prisma/client/runtime/client").JsonValue;
        weaknessMap: import("@prisma/client/runtime/client").JsonValue;
        personalizedPlan: import("@prisma/client/runtime/client").JsonValue;
        nextAssessmentAvailableAt: Date;
        message?: undefined;
    }>;
    analyzeAndStore(sessionId: string, participantId: string, audioUrl: string): Promise<{
        analysisId: string;
        transcript: string;
        feedback: any;
    }>;
}
