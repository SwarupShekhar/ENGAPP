import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class AzureService {
  private readonly logger = new Logger(AzureService.name);
  private aiEngineUrl: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.aiEngineUrl =
      this.configService.get<string>('AI_ENGINE_URL') ||
      'http://localhost:8001';
  }

  async analyzeSpeech(
    audioUrl: string,
    referenceText: string = '',
    audioBase64?: string,
  ): Promise<{
    transcript: string;
    pronunciationEvidence: any;
    accuracyScore?: number;
    fluencyScore?: number;
    prosodyScore?: number;
    completenessScore?: number;
    wordCount?: number;
    snr?: number;
    fluencyBreakdown?: any;
    azureRawFluency?: number;
    azureRawProsody?: number;
    detailedFeedback?: {
      detailed_errors: any;
      actionable_feedback: any;
      word_level_data: any;
    };
  }> {
    try {
      // Build payload: prefer base64 if available, fallback to URL
      const audioPayload = audioBase64
        ? { audio_base64: audioBase64 }
        : { audio_url: audioUrl };

      // 1. If no reference text, transcribe first to generate it
      let transcript = referenceText;
      if (!transcript) {
        const transcribePayload = {
          ...audioPayload,
          user_id: 'system',
          session_id: 'system',
        };

        this.logger.log(
          `Transcribing audio (base64: ${!!audioBase64}, payload keys: ${Object.keys(transcribePayload).join(',')})`,
        );
        this.logger.log(
          `Payload audio_base64 length: ${transcribePayload.audio_base64?.length || 'N/A'}`,
        );
        this.logger.log(
          `Payload audio_url: ${transcribePayload.audio_url || 'N/A'}`,
        );
        const transResponse = await lastValueFrom(
          this.httpService.post(
            `${this.aiEngineUrl}/api/transcribe`,
            transcribePayload,
          ),
        );
        transcript = transResponse.data.data.text;
        this.logger.log(`Transcription result: "${transcript}"`);
      }

      // 2. Perform Pronunciation Assessment
      this.logger.log(
        `Running pronunciation assessment (base64: ${!!audioBase64})...`,
      );
      const pronResponse = await lastValueFrom(
        this.httpService.post(`${this.aiEngineUrl}/api/pronunciation`, {
          ...audioPayload,
          reference_text: transcript,
          user_id: 'system',
        }),
      );

      const data = pronResponse.data.data;

      return {
        transcript: transcript,
        pronunciationEvidence: data.words,
        accuracyScore: data.accuracy_score,
        fluencyScore: data.fluency_score,
        prosodyScore: data.prosody_score,
        completenessScore: data.completeness_score,
        wordCount: transcript.split(/\s+/).filter((w) => w.length > 0).length,
        snr: 20, // Placeholder
        fluencyBreakdown: data.fluency_breakdown,
        azureRawFluency: data.azure_raw_fluency,
        azureRawProsody: data.azure_raw_prosody,
        detailedFeedback: {
          detailed_errors: data.detailed_errors,
          actionable_feedback: data.actionable_feedback,
          word_level_data: data.word_level_data,
        },
      };
    } catch (error) {
      this.logger.error(`AI Engine call failed: ${error.message}`);
      if (error.response) {
        this.logger.error(
          `AI Engine Response Status: ${error.response.status}`,
        );
        this.logger.error(
          `AI Engine Response Data: ${JSON.stringify(error.response.data).substring(0, 2000)}`,
        );
      } else if (error.request) {
        this.logger.error('AI Engine No Response received');
        this.logger.error(`Request URL: ${error.config?.url}`);
      } else {
        this.logger.error(
          `Error setting up AI Engine request: ${error.message}`,
        );
      }
      throw error;
    }
  }
}
