import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConversationalTutorService } from './conversational-tutor.service';
import { StartSessionDto, EndSessionDto } from './dto/tutor.dto';
import { v4 as uuidv4 } from 'uuid';

@Controller('conversational-tutor')
export class ConversationalTutorController {
  constructor(private tutorService: ConversationalTutorService) {}

  @Post('start-session')
  async startSession(@Body() dto: StartSessionDto) {
    const sessionId = uuidv4();
    const greeting = await this.tutorService.generateGreetingInternal(dto.userId);

    return {
      sessionId,
      message: greeting.message,
      audioBase64: greeting.audioBase64,
    };
  }

  @Post('process-speech')
  @UseInterceptors(FileInterceptor('audio'))
  async processSpeech(
    @UploadedFile() audio: Express.Multer.File,
    @Body('sessionId') sessionId: string,
    @Body('userId') userId: string,
  ) {
    if (!audio) throw new BadRequestException('Audio file is required');
    if (!sessionId) throw new BadRequestException('sessionId is required');
    if (!userId) throw new BadRequestException('userId is required');

    return this.tutorService.processSpeechWithIntent(
      audio.buffer,
      userId,
      sessionId,
    );
  }

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  async transcribe(
    @UploadedFile() audio: Express.Multer.File,
    @Body('userId') userId: string,
  ) {
    if (!audio) throw new BadRequestException('Audio file is required');
    if (!userId) throw new BadRequestException('userId is required');

    const result = await this.tutorService.transcribeHinglish(audio.buffer, userId);
    return { text: result.text };
  }

  @Post('assess-pronunciation')
  @UseInterceptors(FileInterceptor('audio'))
  async assessPronunciation(
    @UploadedFile() audio: Express.Multer.File,
    @Body('sessionId') sessionId: string,
    @Body('referenceText') referenceText: string,
  ) {
    if (!audio) throw new BadRequestException('Audio file is required');
    if (!referenceText) throw new BadRequestException('referenceText is required');
    if (!sessionId) throw new BadRequestException('sessionId is required');

    return this.tutorService.assessPronunciation(
      audio.buffer,
      referenceText,
      sessionId,
    );
  }

  @Post('end-session')
  async endSession(@Body() dto: EndSessionDto) {
    return this.tutorService.endSession(dto.sessionId);
  }
}
