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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrainService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const generative_ai_1 = require("@google/generative-ai");
let BrainService = class BrainService {
    constructor(configService) {
        this.configService = configService;
        const apiKey = this.configService.get('GEMINI_API_KEY') || this.configService.get('GOOGLE_LANGUAGE_API_KEY');
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not defined');
        }
        this.genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    }
    async analyzeImageDescription(transcript, imageLevel, imageDescription) {
        const prompt = `
        Analyze this English speaking sample.
        Image description level: ${imageLevel}
        Shown image description: "${imageDescription}"
        User transcript: "${transcript}"

        Return EXACT JSON:
        {
            "grammarScore": number (0-100),
            "vocabularyCEFR": "A1|A2|B1|B2|C1|C2",
            "relevanceScore": number (0-100),
            "talkStyle": "DRIVER|PASSENGER"
        }

        Rules:
        - grammarScore: penalize tense/article/preposition errors
        - vocabularyCEFR: classify sophistication
        - relevanceScore: how well image described
        - DRIVER if >30 words + detailed
        - PASSENGER otherwise
        `;
        const generationConfig = {
            temperature: 0.2,
            responseMimeType: "application/json",
        };
        try {
            const result = await this.model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig,
            });
            const response = await result.response;
            const text = response.text();
            return JSON.parse(text);
        }
        catch (error) {
            console.error("Gemini Phase 3 Error:", error);
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
        const prompt = `
        Analyze the following English speech transcript and pronunciation scores.
        Provide feedback in JSON format:
        {
            "corrected": "Corrected sentence",
            "explanation": "Grammar rule explanation",
            "severity": "low|medium|high",
            "pronunciationTip": "Tip for improvement",
            "mistakes": [
                { "original": "word", "corrected": "word", "type": "grammar|vocab|pronunciation" }
            ]
        }

        Transcript: "${transcript}"
        Evidence/Scores: ${JSON.stringify(evidence)}
        `;
        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanText);
        }
        catch (error) {
            console.error("Gemini Error:", error);
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
exports.BrainService = BrainService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], BrainService);
//# sourceMappingURL=brain.service.js.map