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
exports.AzureService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
const sdk = require("microsoft-cognitiveservices-speech-sdk");
let AzureService = class AzureService {
    constructor(configService) {
        this.configService = configService;
    }
    async analyzeSpeech(audioUrl, referenceText = '') {
        const speechKey = this.configService.get('AZURE_SPEECH_KEY');
        const speechRegion = this.configService.get('AZURE_SPEECH_REGION');
        if (!speechKey || !speechRegion) {
            throw new Error('Azure Speech credentials not configured');
        }
        return new Promise(async (resolve, reject) => {
            try {
                const response = await axios_1.default.get(audioUrl, { responseType: 'arraybuffer' });
                const audioBuffer = Buffer.from(response.data);
                const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
                speechConfig.speechRecognitionLanguage = "en-US";
                const pushStream = sdk.AudioInputStream.createPushStream();
                pushStream.write(audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength));
                pushStream.close();
                const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
                const pronunciationConfig = new sdk.PronunciationAssessmentConfig(referenceText, sdk.PronunciationAssessmentGradingSystem.HundredMark, sdk.PronunciationAssessmentGranularity.Phoneme, true);
                const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
                pronunciationConfig.applyTo(recognizer);
                let transcript = '';
                let pronResults = [];
                recognizer.recognized = (s, e) => {
                    if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
                        transcript += e.result.text + " ";
                        const pronResult = sdk.PronunciationAssessmentResult.fromResult(e.result);
                        if (pronResult) {
                            pronResults.push(pronResult);
                        }
                    }
                };
                recognizer.canceled = (s, e) => {
                    if (e.reason === sdk.CancellationReason.Error) {
                        console.error(`CANCELED: ErrorCode=${e.errorCode}`);
                        console.error(`CANCELED: ErrorDetails=${e.errorDetails}`);
                        reject(new Error(`Azure Speech Canceled: ${e.errorDetails}`));
                    }
                    recognizer.stopContinuousRecognitionAsync();
                };
                recognizer.sessionStopped = (s, e) => {
                    recognizer.stopContinuousRecognitionAsync();
                    if (pronResults.length > 0) {
                        const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
                        const finalTranscript = transcript.trim();
                        resolve({
                            transcript: finalTranscript,
                            pronunciationEvidence: pronResults,
                            accuracyScore: avg(pronResults.map(r => r.accuracyScore)),
                            fluencyScore: avg(pronResults.map(r => r.fluencyScore)),
                            prosodyScore: avg(pronResults.map(r => r.prosodyScore)),
                            completenessScore: avg(pronResults.map(r => r.completenessScore)),
                            wordCount: finalTranscript.split(/\s+/).filter(w => w.length > 0).length,
                            snr: 20
                        });
                    }
                    else {
                        resolve({
                            transcript: transcript.trim(),
                            pronunciationEvidence: null,
                            wordCount: transcript.trim().split(/\s+/).filter(w => w.length > 0).length
                        });
                    }
                };
                recognizer.startContinuousRecognitionAsync();
            }
            catch (error) {
                reject(error);
            }
        });
    }
};
exports.AzureService = AzureService;
exports.AzureService = AzureService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AzureService);
//# sourceMappingURL=azure.service.js.map