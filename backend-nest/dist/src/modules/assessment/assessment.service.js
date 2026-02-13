"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AssessmentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssessmentService = void 0;
const common_1 = require("@nestjs/common");
const azure_service_1 = require("../azure/azure.service");
const brain_service_1 = require("../brain/brain.service");
const prisma_service_1 = require("../../database/prisma/prisma.service");
const azure_storage_service_1 = require("../../integrations/azure-storage.service");
const assessment_dto_1 = require("./dto/assessment.dto");
const ELICITED_SENTENCES = {
    A2: "I like to eat breakfast at home.",
    B1: "Although I was tired, I finished my work before going to bed.",
    C1: "The unprecedented technological advancements have fundamentally transformed our daily communication patterns."
};
const IMAGE_DESCRIPTIONS = {
    A2: "A simple kitchen with a white refrigerator, wooden table, two chairs, and a window.",
    B1: "A busy park with people jogging, walking a dog, and sitting on a bench reading.",
    B2: "A professional business meeting with people in an office, one person presenting at a whiteboard."
};
const CLOUDINARY_IMAGES = {
    A2: "https://res.cloudinary.com/de8vvmpip/image/upload/v1770879569/kitchen_pqrrxf.png",
    B1: "https://res.cloudinary.com/de8vvmpip/image/upload/v1770879569/Busypark_rx3ebg.png",
    B2: "https://res.cloudinary.com/de8vvmpip/image/upload/v1770879569/Office_meeting_kgdysg.png"
};
let AssessmentService = AssessmentService_1 = class AssessmentService {
    constructor(azure, brain, prisma, storage) {
        this.azure = azure;
        this.brain = brain;
        this.prisma = prisma;
        this.storage = storage;
        this.logger = new common_1.Logger(AssessmentService_1.name);
    }
    async startAssessment(userId) {
        const lastAssessment = await this.prisma.assessmentSession.findFirst({
            where: { userId, status: 'COMPLETED' },
            orderBy: { createdAt: 'desc' }
        });
        if (lastAssessment && lastAssessment.completedAt) {
            const diffInMs = new Date().getTime() - new Date(lastAssessment.completedAt).getTime();
            const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
            if (diffInDays < 7) {
                const nextAvailableAt = new Date(new Date(lastAssessment.completedAt).getTime() + 7 * 24 * 60 * 60 * 1000);
                throw new common_1.ForbiddenException({
                    message: "Reassessment available after 7 days",
                    nextAvailableAt
                });
            }
        }
        return this.prisma.assessmentSession.create({
            data: {
                userId,
                status: 'IN_PROGRESS'
            }
        });
    }
    async submitPhase(dto) {
        this.logger.log(`Submitting phase ${dto.phase} for assessment ${dto.assessmentId}`);
        try {
            const session = await this.prisma.assessmentSession.findUnique({
                where: { id: dto.assessmentId }
            });
            if (!session || session.status !== 'IN_PROGRESS') {
                this.logger.warn(`Invalid session or status: ${session?.status}`);
                throw new common_1.BadRequestException('Invalid or completed assessment session');
            }
            this.logger.log(`Uploading audio for ${dto.phase}...`);
            const audioBuffer = Buffer.from(dto.audioBase64, 'base64');
            const audioKey = `assessments/${session.id}/${dto.phase.toLowerCase()}${dto.attempt ? `-at${dto.attempt}` : ''}.wav`;
            const audioUrl = await this.storage.uploadFile(audioBuffer, audioKey, 'audio/wav');
            this.logger.log(`Audio uploaded to ${audioUrl}`);
            switch (dto.phase) {
                case assessment_dto_1.AssessmentPhase.PHASE_1:
                    return await this.handlePhase1(session, audioUrl);
                case assessment_dto_1.AssessmentPhase.PHASE_2:
                    return await this.handlePhase2(session, audioUrl, dto.attempt || 1);
                case assessment_dto_1.AssessmentPhase.PHASE_3:
                    return await this.handlePhase3(session, audioUrl);
                case assessment_dto_1.AssessmentPhase.PHASE_4:
                    return await this.handlePhase4(session, audioUrl);
                default:
                    throw new common_1.BadRequestException('Invalid phase');
            }
        }
        catch (error) {
            this.logger.error(`Error in submitPhase: ${error.message}`, error.stack);
            throw error;
        }
    }
    async handlePhase1(session, audioUrl) {
        const result = await this.azure.analyzeSpeech(audioUrl);
        if (result.wordCount === 0) {
            return { hint: "We couldn't hear you clearly. Please try again.", nextPhase: assessment_dto_1.AssessmentPhase.PHASE_1 };
        }
        if (result.snr && result.snr < 10) {
            return { hint: "Too much background noise. Please find a quieter place.", nextPhase: assessment_dto_1.AssessmentPhase.PHASE_1 };
        }
        const phase1Data = {
            accuracyScore: result.accuracyScore,
            fluencyScore: result.fluencyScore,
            prosodyScore: result.prosodyScore,
            wordCount: result.wordCount,
            audioUrl
        };
        await this.prisma.assessmentSession.update({
            where: { id: session.id },
            data: { phase1Data }
        });
        return { nextPhase: assessment_dto_1.AssessmentPhase.PHASE_2, nextSentence: { text: ELICITED_SENTENCES.B1, level: 'B1' } };
    }
    async handlePhase2(session, audioUrl, attempt) {
        const referenceText = attempt === 1 ? ELICITED_SENTENCES.B1 : (session.phase2Data?.adaptiveSentence?.text || ELICITED_SENTENCES.B1);
        const result = await this.azure.analyzeSpeech(audioUrl, referenceText);
        const attemptData = {
            accuracyScore: result.accuracyScore,
            fluencyScore: result.fluencyScore,
            audioUrl,
            referenceText
        };
        let phase2Data = session.phase2Data || {};
        if (attempt === 1) {
            phase2Data.attempt1 = attemptData;
            const nextLevel = result.accuracyScore >= 70 ? 'C1' : 'A2';
            phase2Data.adaptiveSentence = { text: ELICITED_SENTENCES[nextLevel], level: nextLevel };
            await this.prisma.assessmentSession.update({
                where: { id: session.id },
                data: { phase2Data }
            });
            return { nextPhase: assessment_dto_1.AssessmentPhase.PHASE_2, nextSentence: phase2Data.adaptiveSentence };
        }
        else {
            phase2Data.attempt2 = attemptData;
            phase2Data.finalPronunciationScore = ((phase2Data.attempt1.accuracyScore || 0) + (attemptData.accuracyScore || 0)) / 2;
            phase2Data.finalFluencyScore = ((phase2Data.attempt1.fluencyScore || 0) + (attemptData.fluencyScore || 0)) / 2;
            await this.prisma.assessmentSession.update({
                where: { id: session.id },
                data: { phase2Data }
            });
            let imgLevel = 'B1';
            const pron = phase2Data.finalPronunciationScore;
            if (pron < 50)
                imgLevel = 'A2';
            else if (pron > 75)
                imgLevel = 'B2';
            return {
                nextPhase: assessment_dto_1.AssessmentPhase.PHASE_3,
                imageUrl: CLOUDINARY_IMAGES[imgLevel],
                imageLevel: imgLevel
            };
        }
    }
    async handlePhase3(session, audioUrl) {
        const azureResult = await this.azure.analyzeSpeech(audioUrl);
        const phase2Data = session.phase2Data;
        let imgLevel = 'B1';
        if (phase2Data.finalPronunciationScore < 50)
            imgLevel = 'A2';
        else if (phase2Data.finalPronunciationScore > 75)
            imgLevel = 'B2';
        const geminiResult = await this.brain.analyzeImageDescription(azureResult.transcript, imgLevel, IMAGE_DESCRIPTIONS[imgLevel]);
        const phase3Data = {
            ...geminiResult,
            transcript: azureResult.transcript,
            audioUrl
        };
        await this.prisma.assessmentSession.update({
            where: { id: session.id },
            data: { phase3Data, talkStyle: geminiResult.talkStyle }
        });
        return { nextPhase: assessment_dto_1.AssessmentPhase.PHASE_4, question: "What is your biggest challenge in learning English?" };
    }
    async handlePhase4(session, audioUrl) {
        const result = await this.azure.analyzeSpeech(audioUrl);
        const compScore = result.wordCount > 15 ? 80 : (result.wordCount > 8 ? 65 : 50);
        const phase4Data = {
            wordCount: result.wordCount,
            comprehensionScore: compScore,
            transcript: result.transcript,
            audioUrl
        };
        const updatedSession = await this.prisma.assessmentSession.update({
            where: { id: session.id },
            data: { phase4Data }
        });
        return this.calculateFinalLevel(updatedSession.id);
    }
    async calculateFinalLevel(assessmentId) {
        const session = await this.prisma.assessmentSession.findUnique({
            where: { id: assessmentId },
            include: { user: true }
        });
        if (!session)
            throw new common_1.NotFoundException('Assessment not found');
        const p2 = session.phase2Data;
        const p3 = session.phase3Data;
        const p4 = session.phase4Data;
        const pron = p2.finalPronunciationScore || 0;
        const flu = p2.finalFluencyScore || 0;
        const grammar = p3.grammarScore || 0;
        const comp = p4.comprehensionScore || 0;
        const cefrMap = { A1: 20, A2: 40, B1: 60, B2: 80, C1: 90, C2: 100 };
        const vocabScore = cefrMap[p3.vocabularyCEFR] || 40;
        const overallScore = (pron * 0.20) + (flu * 0.20) + (grammar * 0.25) + (vocabScore * 0.20) + (comp * 0.15);
        let overallLevel = 'A1';
        if (overallScore > 88)
            overallLevel = 'C2';
        else if (overallScore > 75)
            overallLevel = 'C1';
        else if (overallScore > 60)
            overallLevel = 'B2';
        else if (overallScore > 45)
            overallLevel = 'B1';
        else if (overallScore > 30)
            overallLevel = 'A2';
        const skillBreakdown = {
            pronunciation: {
                phonemeAccuracy: Math.round(pron),
                wordStress: Math.round(p2.attempt2?.prosodyScore || pron),
                connectedSpeech: Math.round((pron + flu) / 2)
            },
            fluency: {
                speechRate: Math.round(flu),
                pauseFrequency: Math.round(100 - (p2.attempt2?.fluencyScore || 0) * 0.2),
                hesitationMarkers: Math.round(100 - flu)
            },
            grammar: {
                tenseControl: Math.round(grammar),
                sentenceComplexity: Math.round(grammar * 0.9),
                agreementErrors: Math.round(100 - grammar)
            },
            vocabulary: {
                lexicalRange: Math.round(vocabScore),
                topicSpecificity: Math.round(vocabScore * 0.85),
                repetitionRate: Math.round(100 - vocabScore * 0.5)
            }
        };
        const weaknessMap = this.generateWeaknessMap(skillBreakdown);
        const personalizedPlan = this.generatePersonalizedPlan(weaknessMap);
        const previousSession = await this.prisma.assessmentSession.findFirst({
            where: { userId: session.userId, status: 'COMPLETED', NOT: { id: session.id } },
            orderBy: { createdAt: 'desc' }
        });
        let improvementDelta = null;
        if (previousSession && previousSession.overallScore) {
            const prevBreakdown = previousSession.skillBreakdown;
            improvementDelta = {
                overall: Math.round(overallScore - previousSession.overallScore),
                pronunciation: Math.round(pron - (prevBreakdown?.pronunciation?.phonemeAccuracy || 0)),
                fluency: Math.round(flu - (prevBreakdown?.fluency?.speechRate || 0)),
                grammar: Math.round(grammar - (prevBreakdown?.grammar?.tenseControl || 0)),
                vocabulary: Math.round(vocabScore - (prevBreakdown?.vocabulary?.lexicalRange || 0))
            };
        }
        const scores = [pron, flu, grammar, vocabScore, comp];
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
        const stdDev = Math.sqrt(variance);
        const confidence = Math.max(0.6, 0.9 - (stdDev / 100));
        await this.prisma.$transaction([
            this.prisma.assessmentSession.update({
                where: { id: session.id },
                data: {
                    status: 'COMPLETED',
                    overallLevel,
                    overallScore,
                    confidence,
                    skillBreakdown,
                    weaknessMap: weaknessMap,
                    improvementDelta: improvementDelta,
                    personalizedPlan: personalizedPlan,
                    completedAt: new Date()
                }
            }),
            this.prisma.user.update({
                where: { id: session.userId },
                data: {
                    overallLevel,
                    talkStyle: session.talkStyle,
                    levelUpdatedAt: new Date()
                }
            })
        ]);
        return {
            assessmentId: session.id,
            status: 'COMPLETED',
            overallLevel,
            overallScore,
            talkStyle: session.talkStyle,
            confidence,
            skillBreakdown,
            weaknessMap,
            improvementDelta,
            personalizedPlan,
            nextAssessmentAvailableAt: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000)
        };
    }
    generateWeaknessMap(skillBreakdown) {
        const map = [];
        const evaluate = (area, score) => {
            if (score < 60) {
                map.push({ area, severity: "HIGH" });
            }
            else if (score < 75) {
                map.push({ area, severity: "MEDIUM" });
            }
            else {
                map.push({ area, severity: "STRENGTH" });
            }
        };
        Object.entries(skillBreakdown).forEach(([category, values]) => {
            Object.entries(values).forEach(([key, score]) => {
                evaluate(`${category}.${key}`, score);
            });
        });
        return map;
    }
    generatePersonalizedPlan(weaknessMap) {
        const highWeaknesses = weaknessMap
            .filter(w => w.severity === "HIGH")
            .map(w => w.area);
        const dailyFocus = highWeaknesses.length > 0
            ? highWeaknesses.slice(0, 2)
            : ["General Communication", "Speaking Fluency"];
        return {
            dailyFocus,
            weeklyGoal: highWeaknesses.length > 0
                ? `Improve ${highWeaknesses[0]} by 10 points`
                : "Maintain current English proficiency level",
            recommendedExercises: [
                "Shadowing Drill",
                "Timed Speaking (60 seconds)",
                "Vocabulary Expansion Practice"
            ]
        };
    }
    async getResults(id) {
        const session = await this.prisma.assessmentSession.findUnique({
            where: { id }
        });
        if (!session)
            throw new common_1.NotFoundException('Assessment not found');
        return session;
    }
    async getDashboardData(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId }
        });
        const latestAssessment = await this.prisma.assessmentSession.findFirst({
            where: { userId, status: 'COMPLETED' },
            orderBy: { createdAt: 'desc' }
        });
        if (!latestAssessment) {
            return {
                state: 'ONBOARDING',
                message: 'No assessments completed yet.'
            };
        }
        const nextAvailableAt = new Date(new Date(latestAssessment.completedAt).getTime() + 7 * 24 * 60 * 60 * 1000);
        return {
            state: 'DASHBOARD',
            currentLevel: user?.overallLevel,
            overallScore: latestAssessment.overallScore,
            improvementDelta: latestAssessment.improvementDelta,
            skillBreakdown: latestAssessment.skillBreakdown,
            weaknessMap: latestAssessment.weaknessMap,
            personalizedPlan: latestAssessment.personalizedPlan,
            nextAssessmentAvailableAt: nextAvailableAt
        };
    }
    async analyzeAndStore(sessionId, participantId, audioUrl) {
        const evidence = await this.azure.analyzeSpeech(audioUrl);
        const feedback = await this.brain.interpretAzureEvidence(evidence.transcript, evidence.pronunciationEvidence);
        const analysis = await this.prisma.analysis.create({
            data: {
                sessionId,
                participantId,
                rawData: evidence,
                scores: {
                    accuracy: evidence.accuracyScore || 0,
                    fluency: evidence.fluencyScore || 0,
                    prosody: evidence.prosodyScore || 0
                },
                mistakes: {
                    create: feedback.mistakes?.map(m => ({
                        type: m.type || 'general',
                        original: m.original,
                        corrected: m.corrected,
                        explanation: feedback.explanation || '',
                        timestamp: 0,
                        segmentId: '0'
                    })) || []
                }
            },
            include: {
                mistakes: true
            }
        });
        return {
            analysisId: analysis.id,
            transcript: evidence.transcript,
            feedback
        };
    }
};
exports.AssessmentService = AssessmentService;
exports.AssessmentService = AssessmentService = AssessmentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [azure_service_1.AzureService,
        brain_service_1.BrainService,
        prisma_service_1.PrismaService,
        azure_storage_service_1.AzureStorageService])
], AssessmentService);
//# sourceMappingURL=assessment.service.js.map