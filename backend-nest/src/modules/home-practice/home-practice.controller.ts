import {
  Controller, Get, Post, Request, UseGuards, UseInterceptors, UploadedFile, Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClerkGuard } from '../auth/clerk.guard';
import { HomePracticeService } from './home-practice.service';

@Controller('home/practice')
@UseGuards(ClerkGuard)
export class HomePracticeController {
  constructor(private readonly service: HomePracticeService) {}

  @Get('status')
  getStatus(@Request() req) {
    return this.service.getPracticeStatus(req.user.id);
  }

  @Post('assess')
  @UseInterceptors(FileInterceptor('audio'))
  assess(
    @Request() req,
    @UploadedFile() audio: { buffer: Buffer; originalname: string; mimetype: string } | undefined,
    @Body() body: { cardType: 'phrase_daily' | 'word_daily' | 'mistake_task'; referenceText?: string; taskId?: string },
  ) {
    if (!audio) return { pass: false, errored: true, message: 'no_audio' };
    return this.service.assess(req.user.id, audio, body.cardType, body.referenceText ?? '', body.taskId);
  }
}
