export declare enum AssessmentPhase {
    PHASE_1 = "PHASE_1",
    PHASE_2 = "PHASE_2",
    PHASE_3 = "PHASE_3",
    PHASE_4 = "PHASE_4"
}
export declare class StartAssessmentDto {
    userId: string;
}
export declare class SubmitPhaseDto {
    assessmentId: string;
    phase: AssessmentPhase;
    audioBase64: string;
    attempt?: number;
}
