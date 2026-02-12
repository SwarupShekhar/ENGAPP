import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

@Injectable()
export class AzureService {
    constructor(private configService: ConfigService) { }

    async analyzeSpeech(audioUrl: string, referenceText: string = ''): Promise<{
        transcript: string;
        pronunciationEvidence: any;
        accuracyScore?: number;
        fluencyScore?: number;
        prosodyScore?: number;
        completenessScore?: number;
        wordCount?: number;
        snr?: number;
    }> {
        const speechKey = this.configService.get<string>('AZURE_SPEECH_KEY');
        const speechRegion = this.configService.get<string>('AZURE_SPEECH_REGION');

        if (!speechKey || !speechRegion) {
            throw new Error('Azure Speech credentials not configured');
        }

        return new Promise(async (resolve, reject) => {
            try {
                // 1. Download audio file as buffer
                const response = await axios.get(audioUrl, { responseType: 'arraybuffer' });
                const audioBuffer = Buffer.from(response.data);

                // 2. Setup Azure Speech Config
                const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
                speechConfig.speechRecognitionLanguage = "en-US";

                // 3. Setup Audio Config using PushStream
                const pushStream = sdk.AudioInputStream.createPushStream();
                pushStream.write(audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength));
                pushStream.close();
                const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

                // 4. Pronunciation Assessment Config
                const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
                    referenceText,
                    sdk.PronunciationAssessmentGradingSystem.HundredMark,
                    sdk.PronunciationAssessmentGranularity.Phoneme,
                    true
                );

                // 5. Create Recognizer
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
                        // Aggregate scores if multiple segments
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
                            snr: 20 // Azure doesn't give SNR directly in Node SDK, placeholder or extract from metadata if available
                        });
                    } else {
                        resolve({
                            transcript: transcript.trim(),
                            pronunciationEvidence: null,
                            wordCount: transcript.trim().split(/\s+/).filter(w => w.length > 0).length
                        });
                    }
                };

                // Start Recognition
                recognizer.startContinuousRecognitionAsync();

            } catch (error) {
                reject(error);
            }
        });
    }
}
