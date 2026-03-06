import {
  Body,
  Controller,
  Logger,
  Post,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma/prisma.service';
import { BrainService } from '../brain/brain.service';
import { TranscriptionService } from './transcription.service';

/**
 * LiveKit webhook: on egress_ended, download recording → Azure Speech → save transcript → AI feedback.
 * Configure LiveKit server to POST to this URL (e.g. /webhooks/livekit/egress).
 * Optionally verify LIVEKIT_WEBHOOK_SECRET in Authorization header.
 */
@Controller('webhooks/livekit')
export class LiveKitWebhookController {
  private readonly logger = new Logger(LiveKitWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly brain: BrainService,
    private readonly transcription: TranscriptionService,
  ) {}

  @Post('egress')
  async onEgress(
    @Body() body: unknown,
    @Headers('authorization') auth?: string,
  ) {
    const secret = this.config.get<string>('LIVEKIT_WEBHOOK_SECRET');
    if (secret && auth !== `Bearer ${secret}`) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    const payload = body as {
      event?: string;
      egressInfo?: {
        egressId?: string;
        status?: string;
        error?: string;
        file?: { location?: string; filename?: string };
        fileResults?: Array<{ filename?: string; location?: string }>;
      };
    };

    if (payload.event !== 'egress_ended') {
      return { ok: true, ignored: true };
    }

    const info = payload.egressInfo;
    if (!info?.egressId) {
      this.logger.warn('egress_ended missing egressId');
      return { ok: true };
    }

    const session = await this.prisma.conversationSession.findFirst({
      where: { egressId: info.egressId },
      include: { participants: true },
    });
    if (!session) {
      this.logger.warn(`No session for egressId=${info.egressId}`);
      return { ok: true };
    }

    if (info.error) {
      this.logger.warn(
        `Egress failed session=${session.id} error=${info.error}`,
      );
      return { ok: true };
    }

    // File location: LiveKit may return S3 path or HTTPS URL depending on egress config
    const fileLocation =
      info.file?.location ??
      (info.fileResults && info.fileResults[0]?.location) ??
      null;
    if (!fileLocation) {
      this.logger.warn(`No file location for session=${session.id}`);
      return { ok: true };
    }

    // Only HTTPS for now; S3 s3:// can be added with @aws-sdk/client-s3 GetObject
    if (!fileLocation.startsWith('http')) {
      this.logger.warn(
        `Unsupported file location (need HTTPS URL): ${fileLocation.substring(0, 50)}`,
      );
      return { ok: true };
    }

    try {
      const transcript =
        await this.transcription.transcribeFromUrl(fileLocation);
      await this.prisma.conversationSession.update({
        where: { id: session.id },
        data: {
          recordingUrl: fileLocation,
        },
      });

      if (transcript?.trim()) {
        const userId = session.participants[0]?.userId;
        if (userId) {
          try {
            await this.brain.analyzeSession(
              session.id,
              transcript.trim(),
              userId,
            );
          } catch (e) {
            this.logger.warn('analyzeSession is not available or failed', e);
          }
        }
      }
      this.logger.log(
        `Egress transcript done session=${session.id} len=${transcript?.length ?? 0}`,
      );
    } catch (e) {
      this.logger.error(`Egress transcription failed session=${session.id}`, e);
    }

    return { ok: true };
  }
}
