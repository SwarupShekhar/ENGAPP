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
var FastApiClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FastApiClient = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
let FastApiClient = FastApiClient_1 = class FastApiClient {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(FastApiClient_1.name);
        this.baseUrl = this.configService.get('FASTAPI_SERVICE_URL') || 'http://localhost:8000';
    }
    async transcribe(audioUrl, sessionId) {
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/api/transcribe`, {
                audio_url: audioUrl,
                session_id: sessionId,
            });
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to call FastAPI transcribe: ${error.message}`);
            throw error;
        }
    }
    async analyze(transcript, sessionId, userId) {
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/api/analyze`, {
                transcript,
                session_id: sessionId,
                user_id: userId,
            });
            return response.data;
        }
        catch (error) {
            this.logger.error(`Failed to call FastAPI analyze: ${error.message}`);
            throw error;
        }
    }
};
exports.FastApiClient = FastApiClient;
exports.FastApiClient = FastApiClient = FastApiClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], FastApiClient);
//# sourceMappingURL=fastapi.client.js.map