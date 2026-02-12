import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber } from 'class-validator';

export enum AssessmentPhase {
    PHASE_1 = 'PHASE_1',
    PHASE_2 = 'PHASE_2',
    PHASE_3 = 'PHASE_3',
    PHASE_4 = 'PHASE_4',
}

export class StartAssessmentDto {
    @IsString()
    @IsNotEmpty()
    userId: string;
}

export class SubmitPhaseDto {
    @IsString()
    @IsNotEmpty()
    assessmentId: string;

    @IsEnum(AssessmentPhase)
    @IsNotEmpty()
    phase: AssessmentPhase;

    @IsString()
    @IsNotEmpty()
    audioBase64: string;

    @IsOptional()
    @IsNumber()
    attempt?: number; // Only for Phase 2 (1 or 2)
}
