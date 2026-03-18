import {
  Controller,
  Logger,
  Post,
  Headers,
  UnauthorizedException,
  Req,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@app/prisma/prisma.service';
import { BrainService } from '../brain/brain.service';
import { TranscriptionService } from './transcription.service';
import {
  FlaggedPronunciationError,
  PronunciationService,
} from '../pronunciation/pronunciation.service';

/** Human-readable tip for pronunciation issues (rule_category from detector). */
function formatPronunciationSuggestion(
  ruleCategory: string,
  correctWord?: string,
): string {
  const tips: Record<string, string> = {
    w_to_v: 'Practice "w" vs "v" (e.g. "wine" vs "vine")',
    v_to_w_reversal: 'Practice "v" vs "w" (e.g. "very" vs "wery")',
    th_to_t: 'Practice "th" /θ/ vs "t" (e.g. "think" vs "tink")',
    th_to_d: 'Practice "th" /ð/ vs "d" (e.g. "the" vs "de")',
    zh_to_j: 'Practice "s" in "vision" vs "j" sound',
    z_to_j: 'Practice "z" vs "j" in words like "measure"',
    h_dropping: 'Pronounce the "h" at the start of words',
    r_rolling: 'Soften "r" — avoid rolling or heavy "r"',
    ae_to_e: 'Practice /æ/ vs /e/ (e.g. "cat" vs "ket")',
    i_to_ee: 'Practice short "i" vs long "ee"',
    o_to_aa: 'Practice vowel in "go" vs "got"',
    general_mispronunciation: `Practice pronouncing "${correctWord}" more clearly`,
  };
  const tip =
    tips[ruleCategory] ||
    `Practice "${correctWord || ruleCategory.replace(/_/g, ' ')}"`;
  return tip;
}

/**
 * LiveKit webhook: on egress_ended, download recording → Azure Speech → save transcript → AI feedback.
 * Configure LiveKit server to POST to this URL (e.g. /webhooks/livekit/egress).
 * Optionally verify LIVEKIT_WEBHOOK_SECRET in Authorization header.
 */
@Controller('webhooks/livekit')
export class LiveKitWebhookController {
  private readonly logger = new Logger(LiveKitWebhookController.name);
  private readonly processedEgress = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly brain: BrainService,
    private readonly transcription: TranscriptionService,
    private readonly pronunciationService: PronunciationService,
  ) {}

  @Post('egress')
  async onEgress(@Req() req: Request, @Headers('authorization') auth?: string) {
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
    
    // Validate credentials before creating WebhookReceiver
    if (!apiKey || !apiSecret) {
      throw new InternalServerErrorException(
        'LIVEKIT credentials not configured',
      );
    }
    
    const receiver = new WebhookReceiver(apiKey, apiSecret);

    // Get raw body
    const rawBody =
      (req as any).rawBody ??
      (await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      }));

    if (!rawBody || rawBody.length === 0) {
      this.logger.warn('Webhook received empty or missing body');
      return { ok: true };
    }

    let event: any;
    try {
      event = await receiver.receive(rawBody.toString(), auth ?? '');
    } catch (e) {
      this.logger.warn(`Webhook signature validation failed: ${(e as Error)?.message}`);
      try {
        event = await receiver.receive(rawBody.toString(), auth ?? '', true);
        this.logger.warn('Webhook parsed with skipAuth=true (signature mismatch)');
      } catch (e2) {
        this.logger.error('Webhook parse failed even without auth', e2);
        return { ok: true };
      }
    }

    const payload = {
      event: event.event,
      egressInfo: event.egressInfo,
    };

    const info = payload.egressInfo;
    this.logger.log(
      `Webhook received: event=${payload.event}, egressId=${info?.egressId}`,
    );

    if (payload.event !== 'egress_ended') {
      this.logger.log(`Ignoring event type: ${payload.event}`);
      return { ok: true, ignored: true };
    }

    if (!info?.egressId) {
      this.logger.warn('egress_ended missing egressId');
      return { ok: true };
    }

    if (this.processedEgress.has(info.egressId)) {
      this.logger.log(
        `Skipping duplicate egress_ended for egressId=${info.egressId}`,
      );
      return { ok: true, duplicate: true };
    }
    this.processedEgress.add(info.egressId);
    setTimeout(
      () => this.processedEgress.delete(info.egressId),
      5 * 60 * 1000,
    );

    const fileLocation =
      info.file?.location ??
      (info.fileResults && info.fileResults[0]?.location) ??
      null;

    const effectiveFileLocation = (() => {
      if (!fileLocation || typeof fileLocation !== 'string') return fileLocation;
      try {
        const u = new URL(fileLocation);
        if (!u.hostname.endsWith('.blob.core.windows.net')) return fileLocation;

        const containerName =
          this.config.get<string>('LIVEKIT_EGRESS_AZURE_CONTAINER') ??
          this.config.get<string>('AZURE_STORAGE_CONTAINER') ??
          'recordings';

        const path = u.pathname.replace(/^\/+/, '');
        const [container, ...restParts] = path.split('/');
        if (container !== containerName) return fileLocation;

        const blobPath = restParts.join('/');
        // Our egress service writes filepath prefixed with "recordings/..." inside the container.
        // LiveKit sometimes reports the location without that prefix; normalize here so downstream
        // services can fetch the actual blob.
        if (blobPath && !blobPath.startsWith('recordings/')) {
          u.pathname = `/${containerName}/recordings/${blobPath}`;
          return u.toString();
        }
        return fileLocation;
      } catch {
        return fileLocation;
      }
    })();

    this.logger.log(`Egress file location: ${effectiveFileLocation}`);

    if (!effectiveFileLocation || !effectiveFileLocation.startsWith('http')) {
      this.logger.warn(`Invalid file location for egressId=${info.egressId}`);
      return { ok: true };
    }

    // Check if this is a per-participant egress
    const participant = await (this.prisma.sessionParticipant as any).findFirst(
      {
        where: { participantEgressId: info.egressId },
      },
    );

    this.logger.log(
      `Participant lookup for egressId=${info.egressId} returned: ${
        participant ? 'found' : 'not found'
      }`,
    );

    if (participant) {
      // ── Per-participant track recording ended → run pronunciation ──
      this.logger.log(
        `Track egress ended for participant=${participant.userId} sessionId=${participant.sessionId}`,
      );
      await this.prisma.sessionParticipant.update({
        where: { id: participant.id },
        data: { participantRecordingUrl: effectiveFileLocation } as any,
      });

      try {
        const transcript =
          await this.transcription.transcribeFromUrl(effectiveFileLocation, {
            userId: participant.userId,
            sessionId: participant.sessionId,
            language: 'en-US',
          });
        this.logger.log(
          `Per-participant transcript for participant=${participant.userId}: len=${transcript?.length ?? 0} preview="${(transcript ?? '').substring(0, 80)}"`,
        );
        if (!transcript?.trim()) {
          this.logger.warn(
            `Empty transcript for participant=${participant.userId} — skipping pronunciation assessment`,
          );
          return { ok: true };
        }

        const { flagged_errors, pronunciation_score } =
          await this.pronunciationService.assessFromRecordingUrl(
            participant.userId,
            effectiveFileLocation,
            transcript.trim(), // clean, single-speaker, no labels
          );

        // Find or create Analysis row (webhook can fire before the main session processor writes Analysis)
        // Use upsert on (sessionId, participantId) so it's safe/idempotent with analyzeAndStoreJoint.
        let analysis: { id: string; scores: unknown } | null = null;
        for (let i = 0; i < 10; i++) {
          analysis = await this.prisma.analysis.findFirst({
            where: {
              sessionId: participant.sessionId,
              participant: { userId: participant.userId },
            },
            select: { id: true, scores: true },
          });
          if (analysis) break;
          await new Promise((res) => setTimeout(res, 3000));
        }

        if (!analysis) {
          const created = await this.prisma.analysis.upsert({
            where: {
              sessionId_participantId: {
                sessionId: participant.sessionId,
                participantId: participant.id,
              },
            },
            create: {
              sessionId: participant.sessionId,
              participantId: participant.id,
              rawData: {
                source: 'livekit_pronunciation_webhook',
                transcript: transcript.trim(),
              } as any,
              scores: {} as any,
              cefrLevel: null,
            },
            update: {
              rawData: {
                source: 'livekit_pronunciation_webhook',
                transcript: transcript.trim(),
              } as any,
            },
            select: { id: true, scores: true },
          });
          analysis = created;
          this.logger.log(
            `Created placeholder Analysis for participant=${participant.userId} sessionId=${participant.sessionId} to persist pronunciation`,
          );
        }

        if (analysis) {
          if (Array.isArray(flagged_errors) && flagged_errors.length > 0) {
            await this.prisma.pronunciationIssue.createMany({
              data: flagged_errors.map((err: FlaggedPronunciationError) => ({
                analysisId: analysis!.id,
                word: err.spoken,
                issueType: err.rule_category,
                severity:
                  err.confidence < 40
                    ? 'high'
                    : err.confidence < 65
                      ? 'medium'
                      : 'low',
                confidence: err.confidence,
                suggestion: formatPronunciationSuggestion(
                  err.rule_category,
                  err.correct,
                ),
              })),
              skipDuplicates: true,
            });
            this.logger.log(
              `Wrote ${flagged_errors.length} pronunciation issues for participant=${participant.userId} sessionId=${participant.sessionId}`,
            );
          }

          if (pronunciation_score?.score != null) {
            const existingScores =
              (analysis.scores as Record<string, number>) || {};
            await this.prisma.analysis.update({
              where: { id: analysis.id },
              data: {
                scores: {
                  ...existingScores,
                  pronunciation: pronunciation_score.score,
                  pronunciation_score: pronunciation_score.score,
                } as object,
              },
            });
            this.logger.log(
              `Updated pronunciation score=${pronunciation_score.score} for participant=${participant.userId}`,
            );
          }
        }
      } catch (e) {
        this.logger.error(
          `Pronunciation assessment failed participant=${participant.userId}`,
          e,
        );
      }

      return { ok: true };
    }

    // ── Room Composite recording ended → existing Brain/transcription flow ──
    const session = await this.prisma.conversationSession.findFirst({
      where: { egressId: info.egressId },
      include: { participants: true },
    });

    this.logger.log(
      `Composite session lookup for egressId=${info.egressId} returned: ${
        session ? 'found' : 'not found'
      }`,
    );

    if (!session) {
      this.logger.warn(`No session found for egressId=${info.egressId}`);
      return { ok: true };
    }

    if (info.error) {
      this.logger.warn(
        `Egress failed session=${session.id} error=${info.error}`,
      );
      return { ok: true };
    }

    try {
      const transcript =
        await this.transcription.transcribeFromUrl(effectiveFileLocation, {
          userId: session.participants[0]?.userId ?? 'system',
          sessionId: session.id,
          language: 'en-US',
        });
      await this.prisma.conversationSession.update({
        where: { id: session.id },
        data: {
          recordingUrl: effectiveFileLocation,
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
