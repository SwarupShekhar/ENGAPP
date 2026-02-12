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
var LivekitService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LivekitService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const livekit_server_sdk_1 = require("livekit-server-sdk");
let LivekitService = LivekitService_1 = class LivekitService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(LivekitService_1.name);
    }
    async generateToken(roomName, participantName) {
        try {
            const apiKey = this.configService.get('livekit.apiKey');
            const apiSecret = this.configService.get('livekit.apiSecret');
            const at = new livekit_server_sdk_1.AccessToken(apiKey, apiSecret, {
                identity: participantName,
            });
            at.addGrant({
                roomJoin: true,
                room: roomName,
                canPublish: true,
                canSubscribe: true,
            });
            return at.toJwt();
        }
        catch (error) {
            this.logger.error(`Failed to generate LiveKit token: ${error.message}`);
            throw error;
        }
    }
};
exports.LivekitService = LivekitService;
exports.LivekitService = LivekitService = LivekitService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], LivekitService);
//# sourceMappingURL=livekit.service.js.map