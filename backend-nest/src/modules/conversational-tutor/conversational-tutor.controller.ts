import {
  Controller,
  Post,
  Body,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ConversationalTutorService } from './conversational-tutor.service';
import { StartSessionDto, EndSessionDto } from './dto/tutor.dto';
import { v4 as uuidv4 } from 'uuid';
import { ClerkGuard } from '../auth/clerk.guard';

@Controller('conversational-tutor')
@UseGuards(ClerkGuard)
export class ConversationalTutorController {
  constructor(private tutorService: ConversationalTutorService) {}

  @Post('start-session')
  async startSession(@Request() req) {
    return this.tutorService.startSession(req.user.id);
  }

  @Post('process-speech')
  @UseInterceptors(FileInterceptor('audio'))
  async processSpeech(
    @UploadedFile() audio: Express.Multer.File,
    @Body('sessionId') sessionId: string,
    @Request() req,
  ) {
    if (!audio) throw new BadRequestException('Audio file is required');
    if (!sessionId) throw new BadRequestException('sessionId is required');

    return this.tutorService.processSpeechWithIntent(
      audio.buffer,
      req.user.id,
      sessionId,
    );
  }

  /**
   * Stream tutor response via SSE. Use this for lower latency: first audio chunk in ~2–3s.
   * Client should send multipart with audio + sessionId; response is text/event-stream.
   */
  @Post('stream-speech')
  @UseInterceptors(FileInterceptor('audio'))
  async streamSpeech(
    @Res({ passthrough: false }) res: Response,
    @UploadedFile() audio: Express.Multer.File,
    @Body('sessionId') sessionId: string,
    @Request() req,
  ) {
    if (!audio) throw new BadRequestException('Audio file is required');
    if (!sessionId) throw new BadRequestException('sessionId is required');

    await this.tutorService.pipeStreamSpeechResponse(
      audio.buffer,
      req.user.id,
      sessionId,
      res,
    );
  }

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  async transcribe(@UploadedFile() audio: Express.Multer.File, @Request() req) {
    if (!audio) throw new BadRequestException('Audio file is required');

    const result = await this.tutorService.transcribeHinglish(
      audio.buffer,
      req.user.id,
    );
    return {
      text: result.text,
      phonetic_insights: result.phonetic_insights,
    };
  }

  @Post('assess-pronunciation')
  @UseInterceptors(FileInterceptor('audio'))
  async assessPronunciation(
    @UploadedFile() audio: Express.Multer.File,
    @Body('sessionId') sessionId: string,
    @Body('referenceText') referenceText: string,
  ) {
    if (!audio) throw new BadRequestException('Audio file is required');
    if (!referenceText)
      throw new BadRequestException('referenceText is required');
    if (!sessionId) throw new BadRequestException('sessionId is required');

    return this.tutorService.assessPronunciation(
      audio.buffer,
      referenceText,
      sessionId,
    );
  }

  @Post('debug-phonemes')
  @UseInterceptors(FileInterceptor('audio'))
  async debugPhonemes(
    @UploadedFile() audio: Express.Multer.File,
    @Body('phrase') phrase: string,
  ) {
    if (!audio) throw new BadRequestException('Audio file is required');
    if (!phrase) throw new BadRequestException('phrase is required');

    return this.tutorService.debugPhonemes(audio.buffer, phrase);
  }

  @Post('append-turn')
  appendTurn(
    @Body('sessionId') sessionId: string,
    @Body('userText') userText: string,
    @Body('aiText') aiText: string,
  ) {
    if (!sessionId || userText == null || aiText == null) {
      throw new BadRequestException('sessionId, userText, and aiText are required');
    }
    this.tutorService.appendTurn(sessionId, userText, aiText);
    return { ok: true };
  }

  @Post('end-session')
  async endSession(@Body() dto: EndSessionDto) {
    return this.tutorService.endSession(dto.sessionId);
  }
}
