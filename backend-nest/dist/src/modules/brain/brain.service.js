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
var BrainService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrainService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
let BrainService = BrainService_1 = class BrainService {
    constructor(configService, httpService) {
        this.configService = configService;
        this.httpService = httpService;
        this.logger = new common_1.Logger(BrainService_1.name);
        this.aiEngineUrl = this.configService.get('AI_ENGINE_URL') || 'http://localhost:8001';
    }
    async analyzeImageDescription(transcript, imageLevel, imageDescription) {
        try {
            const response = await (0, rxjs_1.lastValueFrom)(this.httpService.post(`${this.aiEngineUrl}/api/analyze`, {
                text: transcript,
                user_id: "system",
                session_id: "system",
                context: `Assessment Phase 3. Image Level: ${imageLevel}. Image Description: ${imageDescription}. Require relevance score and talk style.`
            }));
            const data = response.data.data;
            return {
                grammarScore: data.metrics.grammar_score * 10,
                vocabularyCEFR: data.cefr_assessment.level,
                relevanceScore: 80,
                talkStyle: "PASSENGER"
            };
        }
        catch (error) {
            this.logger.error("BrainService Phase 3 Error:", error);
            return this.ruleBasedFallback(transcript);
        }
    }
    ruleBasedFallback(transcript) {
        const wordCount = transcript.split(/\s+/).filter(w => w.length > 0).length;
        return {
            grammarScore: 70,
            vocabularyCEFR: wordCount > 20 ? "B1" : "A2",
            relevanceScore: 75,
            talkStyle: wordCount > 30 ? "DRIVER" : "PASSENGER"
        };
    }
    async interpretAzureEvidence(transcript, evidence) {
        try {
            const response = await (0, rxjs_1.lastValueFrom)(this.httpService.post(`${this.aiEngineUrl}/api/analyze`, {
                text: transcript,
                user_id: "system",
                session_id: "system",
                context: `Interpret Azure Evidence: ${JSON.stringify(evidence)}`
            }));
            const data = response.data.data;
            const mistakes = data.errors.map(e => ({
                original: e.original_text,
                corrected: e.corrected_text,
                type: e.type,
                explanation: e.explanation
            }));
            return {
                corrected: mistakes.length > 0 ? mistakes[0].corrected : transcript,
                explanation: data.feedback,
                severity: "medium",
                pronunciationTip: data.improvement_areas[0] || "Keep practicing!",
                mistakes: mistakes
            };
        }
        catch (error) {
            this.logger.error("BrainService Interpret Error:", error);
            return {
                original: transcript,
                corrected: transcript,
                explanation: "AI service temporarily unavailable.",
                severity: "low",
                pronunciationTip: "Keep practicing!",
                mistakes: []
            };
        }
    }
};
exports.BrainService = BrainService;
exports.BrainService = BrainService = BrainService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        axios_1.HttpService])
], BrainService);
//# sourceMappingURL=brain.service.js.map