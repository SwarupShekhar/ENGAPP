import { AssessmentService } from './assessment.service';
import { SubmitPhaseDto } from './dto/assessment.dto';
export declare class AssessmentController {
    private readonly assessmentService;
    constructor(assessmentService: AssessmentService);
    start(req: any): Promise<{
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
    submit(dto: SubmitPhaseDto): Promise<{
        hint: string;
        nextPhase: import("./dto/assessment.dto").AssessmentPhase;
        nextSentence?: undefined;
    } | {
        nextPhase: import("./dto/assessment.dto").AssessmentPhase;
        nextSentence: {
            text: string;
            level: string;
        };
        hint?: undefined;
    } | {
        nextPhase: import("./dto/assessment.dto").AssessmentPhase;
        nextSentence: any;
        imageUrl?: undefined;
        imageLevel?: undefined;
    } | {
        nextPhase: import("./dto/assessment.dto").AssessmentPhase;
        imageUrl: any;
        imageLevel: string;
        nextSentence?: undefined;
    } | {
        nextPhase: import("./dto/assessment.dto").AssessmentPhase;
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
    getDashboard(req: any): Promise<{
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
}
