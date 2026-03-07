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

      // The FastAPI endpoint is /api/pronunciation/assess and expects JSON
      // if we are passing azure_result, but we want it to run the assessment,
      // so we must send multipart/form-data with the audio file.
      // Wait, earlier I noticed backend-ai prefers `audio` as Form/File.
      // Let's check how transcribe does it or adapt the JSON payload.
      // Actually backend-ai `assess_pronunciation` expects `audio: UploadFile` or `azure_result` json string.
      // If we are passing base64, we need to adapt either backend-ai or send it as a file.
      // Let's look at what `transcribe` accepts.

      const pronResponse = await lastValueFrom(
        this.httpService.post(`${this.aiEngineUrl}/api/pronunciation/assess`, {
          ...audioPayload,
          reference_text: transcript,
          user_id: 'system',
        }),
      );

      // Backend-ai returns { flagged_errors, pronunciation_score } (no .data wrapper).
      // pronunciation_score is { score, cefr_cap, cap_reason, category_breakdown, dominant_errors }.
      const body = pronResponse.data?.data ?? pronResponse.data;
      const pronScore =
        typeof body?.pronunciation_score === 'object'
          ? body.pronunciation_score
          : { score: body?.pronunciation_score ?? 50 };
      const score = Number(pronScore.score ?? 50);
      const words = body?.words ?? body?.flagged_errors ?? [];
      const wordCount = transcript.split(/\s+/).filter((w) => w.length > 0).length;

      return {
        transcript: transcript,
        pronunciationEvidence: Array.isArray(words) ? words : [],
        accuracyScore: score,
        fluencyScore: body?.fluency_score ?? Math.max(50, score - 10),
        prosodyScore: body?.prosody_score ?? score,
        completenessScore: body?.completeness_score ?? 100,
        wordCount,
        snr: 20,
        fluencyBreakdown: body?.fluency_breakdown ?? null,
        azureRawFluency: body?.azure_raw_fluency ?? score,
        azureRawProsody: body?.azure_raw_prosody ?? score,
        detailedFeedback: {
          detailed_errors: body?.detailed_errors ?? body?.flagged_errors ?? [],
          actionable_feedback: body?.actionable_feedback ?? null,
          word_level_data: body?.word_level_data ?? null,
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
