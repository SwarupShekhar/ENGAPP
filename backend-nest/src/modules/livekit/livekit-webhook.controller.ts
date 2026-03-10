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
import {
  FlaggedPronunciationError,
  PronunciationService,
} from '../pronunciation/pronunciation.service';

/** Human-readable tip for pronunciation issues (rule_category from detector). */
function formatPronunciationSuggestion(ruleCategory: string, correctWord?: string): string {
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
  };
  const tip = tips[ruleCategory] || `Practice "${correctWord || ruleCategory.replace(/_/g, ' ')}"`;
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

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly brain: BrainService,
    private readonly transcription: TranscriptionService,
    private readonly pronunciationService: PronunciationService,
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

    if (payload.event !== 'egress_ended') return { ok: true, ignored: true };

    const info = payload.egressInfo;
    if (!info?.egressId) {
      this.logger.warn('egress_ended missing egressId');
      return { ok: true };
    }

    const fileLocation =
      info.file?.location ??
      (info.fileResults && info.fileResults[0]?.location) ??
      null;

    if (!fileLocation || !fileLocation.startsWith('http')) {
      this.logger.warn(`Invalid file location for egressId=${info.egressId}`);
      return { ok: true };
    }

    // Check if this is a per-participant egress
    const participant = await (this.prisma.sessionParticipant as any).findFirst(
      {
        where: { participantEgressId: info.egressId },
      },
    );

    if (participant) {
      // ── Per-participant track recording ended → run pronunciation ──
      this.logger.log(
        `Track egress ended for participant=${participant.userId} sessionId=${participant.sessionId}`,
      );
      await this.prisma.sessionParticipant.update({
        where: { id: participant.id },
        data: { participantRecordingUrl: fileLocation } as any,
      });

      try {
        const transcript =
          await this.transcription.transcribeFromUrl(fileLocation);
        if (!transcript?.trim()) {
          return { ok: true };
        }

        const { flagged_errors, pronunciation_score } =
          await this.pronunciationService.assessFromRecordingUrl(
            participant.userId,
            fileLocation,
            transcript.trim(), // clean, single-speaker, no labels
          );

        // Find the Analysis record (may not exist yet — analyzeAndStoreJoint can still be running)
        let analysis: { id: string; scores: unknown } | null = null;
        for (let i = 0; i < 5; i++) {
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

        if (analysis) {
          if (
            Array.isArray(flagged_errors) &&
            flagged_errors.length > 0
          ) {
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
                suggestion: formatPronunciationSuggestion(err.rule_category, err.correct),
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
        } else {
          this.logger.warn(
            `No Analysis found for participant=${participant.userId} sessionId=${participant.sessionId} after retries; pronunciation issues not persisted`,
          );
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
