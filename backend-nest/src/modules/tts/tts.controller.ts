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

@Controller('api/tts')
@UseGuards(ClerkGuard)
export class TtsController {
  private readonly logger = new Logger(TtsController.name);
  private readonly aiEngineUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.aiEngineUrl =
      this.configService.get<string>('AI_ENGINE_URL') || 'http://localhost:8001';
  }

  @Post('feedback-narration')
  async getFeedbackNarration(@Body() body: any) {
    try {
      const response = await lastValueFrom(
        this.httpService.post(
          `${this.aiEngineUrl}/api/tts/feedback-narration`,
          body,
          { timeout: 15000 },
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
          { timeout: 20000 }, // Full narration takes longer
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
}
