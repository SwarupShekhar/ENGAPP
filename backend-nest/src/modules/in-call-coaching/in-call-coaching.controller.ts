import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InCallCoachingService } from './in-call-coaching.service';
import { IsArray, IsString } from 'class-validator';

class ScanTranscriptDto {
  @IsArray()
  @IsString({ each: true })
  segments: string[];
}

// Internal endpoint — no auth guard (internal network only, not exposed to public)
@Controller('internal/coaching-context')
export class InCallCoachingController {
  constructor(private readonly service: InCallCoachingService) {}

  @Get(':userId/:sessionId')
  async getContext(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    const ctx = await this.service.getContext(userId, sessionId);
    if (!ctx) {
      return this.service.buildContext(userId, sessionId);
    }
    return ctx;
  }

  @Post(':userId/:sessionId/build')
  buildContext(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.service.buildContext(userId, sessionId);
  }

  @Post(':userId/:sessionId/hint-confirmed')
  async hintConfirmed(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: { taskId?: string; phrase?: string },
  ) {
    await this.service.confirmHintUsed(userId, sessionId, body.taskId);
    return { ok: true };
  }

  @Get(':userId/:sessionId/summary')
  getCallSummary(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.service.getCallSummary(userId, sessionId);
  }

  @Get(':userId/:sessionId/hints-preload')
  getHintsPreload(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.service.getHintsPreload(userId, sessionId);
  }

  @Post(':userId/:sessionId/scan-transcript')
  async scanTranscript(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: ScanTranscriptDto,
  ) {
    await this.service.scanTranscriptForCredits(userId, sessionId, body.segments ?? []);
    return { ok: true };
  }
}
