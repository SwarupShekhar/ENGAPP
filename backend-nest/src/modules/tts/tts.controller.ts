import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { ClerkGuard } from '../auth/clerk.guard';
import { aiEngineAuthHeaders } from '../../common/ai-engine-auth';

@Controller('api/tts')
@UseGuards(ClerkGuard)
export class TtsController {
  private readonly logger = new Logger(TtsController.name);
  private readonly aiEngineUrl: string;
  private readonly aiHeaders: Record<string, string>;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.aiEngineUrl =
      this.configService.get<string>('AI_ENGINE_URL') || 'http://localhost:8001';
    this.aiHeaders = aiEngineAuthHeaders(this.configService);
  }

  private withAiAuth(options?: Record<string, unknown>) {
    const opts = (options ?? {}) as { headers?: Record<string, string> };
    return {
      ...opts,
      headers: { ...this.aiHeaders, ...opts.headers },
    };
  }

  @Post('feedback-narration')
  async getFeedbackNarration(@Body() body: any) {
    try {
      const response = await lastValueFrom(
        this.httpService.post(
          `${this.aiEngineUrl}/api/tts/feedback-narration`,
          body,
          this.withAiAuth({ timeout: 15000 }),
        ),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `TTS feedback-narration proxy failed: ${error?.message}`,
      );
      throw new HttpException(
        { message: 'TTS service unavailable', audio_base64: '', text: '' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Post('full-feedback-narration')
  async getFullFeedbackNarration(@Body() body: any) {
    try {
      const response = await lastValueFrom(
        this.httpService.post(
          `${this.aiEngineUrl}/api/tts/full-feedback-narration`,
          body,
          this.withAiAuth({ timeout: 20000 }), // Full narration takes longer
        ),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `TTS full-feedback-narration proxy failed: ${error?.message}`,
      );
      throw new HttpException(
        { message: 'TTS service unavailable', audio_base64: '', text: '' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Post('speak')
  async speak(@Body() body: { text: string }) {
    try {
      const response = await lastValueFrom(
        this.httpService.post(
          `${this.aiEngineUrl}/api/tts/speak`,
          body,
          this.withAiAuth({ timeout: 10000 }),
        ),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(`TTS speak proxy failed: ${error?.message}`);
      throw new HttpException(
        { message: 'TTS service unavailable', audio_base64: '', text: '' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
