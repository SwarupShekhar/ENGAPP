import { Controller, Post, Body, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConversationalTutorService } from './conversational-tutor.service';
import { StartSessionDto, ProcessSpeechDto, EndSessionDto } from './dto/tutor.dto';
import { v4 as uuidv4 } from 'uuid';

@Controller('conversational-tutor')
export class ConversationalTutorController {
  constructor(private tutorService: ConversationalTutorService) {}

  @Post('start-session')
  async startSession(@Body() dto: StartSessionDto) {
    const sessionId = uuidv4();
    return { sessionId, message: "Welcome! I'm Priya, your AI Tutor. Let's start speaking." };
  }

  @Post('process-speech')
  @UseInterceptors(FileInterceptor('audio'))
  async processSpeech(
    @UploadedFile() audio: Express.Multer.File,
    @Body() dto: ProcessSpeechDto
  ) {
    // 1. Transcribe
    const sttResult = await this.tutorService.transcribeHinglish(audio.buffer, dto.userId);
    
    // 2. Multi-turn Logic with Gemini
    const aiResult = await this.tutorService.processUserUtterance(dto.sessionId, sttResult.text, dto.userId);
    
    // 3. Synthesize
    const audioBase64 = await this.tutorService.synthesizeHinglish(aiResult.response);
    
    return {
      transcription: sttResult.text,
      aiResponse: aiResult.response,
      correction: aiResult.correction,
      audioBase64: audioBase64
    };
  }

  @Post('end-session')
  async endSession(@Body() dto: EndSessionDto) {
    return this.tutorService.endSession(dto.sessionId);
  }
}
