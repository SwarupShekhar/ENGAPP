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
var AzureService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AzureService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
let AzureService = AzureService_1 = class AzureService {
    constructor(configService, httpService) {
        this.configService = configService;
        this.httpService = httpService;
        this.logger = new common_1.Logger(AzureService_1.name);
        this.aiEngineUrl = this.configService.get('AI_ENGINE_URL') || 'http://localhost:8001';
    }
    async analyzeSpeech(audioUrl, referenceText = '', audioBase64) {
        try {
            const audioPayload = audioBase64
                ? { audio_base64: audioBase64 }
                : { audio_url: audioUrl };
            let transcript = referenceText;
            if (!transcript) {
                const transcribePayload = {
                    ...audioPayload,
                    user_id: "system",
                    session_id: "system"
                };
                this.logger.log(`Transcribing audio (base64: ${!!audioBase64}, payload keys: ${Object.keys(transcribePayload).join(',')})`);
                this.logger.log(`Payload audio_base64 length: ${transcribePayload.audio_base64?.length || 'N/A'}`);
                this.logger.log(`Payload audio_url: ${transcribePayload.audio_url || 'N/A'}`);
                const transResponse = await (0, rxjs_1.lastValueFrom)(this.httpService.post(`${this.aiEngineUrl}/api/transcribe`, transcribePayload));
                transcript = transResponse.data.data.text;
                this.logger.log(`Transcription result: "${transcript}"`);
            }
            this.logger.log(`Running pronunciation assessment (base64: ${!!audioBase64})...`);
            const pronResponse = await (0, rxjs_1.lastValueFrom)(this.httpService.post(`${this.aiEngineUrl}/api/pronunciation`, {
                ...audioPayload,
                reference_text: transcript,
                user_id: "system"
            }));
            const data = pronResponse.data.data;
            return {
                transcript: transcript,
                pronunciationEvidence: data.words,
                accuracyScore: data.accuracy_score,
                fluencyScore: data.fluency_score,
                prosodyScore: data.prosody_score,
                completenessScore: data.completeness_score,
                wordCount: transcript.split(/\s+/).filter(w => w.length > 0).length,
                snr: 20
            };
        }
        catch (error) {
            this.logger.error(`AI Engine call failed: ${error.message}`);
            if (error.response) {
                this.logger.error(`AI Engine Response Status: ${error.response.status}`);
                this.logger.error(`AI Engine Response Data: ${JSON.stringify(error.response.data).substring(0, 2000)}`);
            }
            else if (error.request) {
                this.logger.error('AI Engine No Response received');
                this.logger.error(`Request URL: ${error.config?.url}`);
            }
            else {
                this.logger.error(`Error setting up AI Engine request: ${error.message}`);
            }
            throw error;
        }
    }
};
exports.AzureService = AzureService;
exports.AzureService = AzureService = AzureService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        axios_1.HttpService])
], AzureService);
//# sourceMappingURL=azure.service.js.map