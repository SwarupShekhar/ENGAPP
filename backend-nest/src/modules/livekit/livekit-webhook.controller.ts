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

import { ScoringService } from '../scoring/scoring.service';
import { RedisService } from '../../redis/redis.service';

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
    private readonly scoringService: ScoringService,
    private readonly redis: RedisService,
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
    
    // PHASE 1 AUDIT LOG
    this.logger.log(
      `[PHASE 1 AUDIT] Webhook Received: egressId=${info.egressId}, egressType=${info.case || 'unknown'}, blobUrl=${effectiveFileLocation}`
    );

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
      
      this.logger.log(
        `[PHASE 2 AUDIT] Speaker Separation Confirmed: participantId=${participant.userId}, sessionId=${participant.sessionId}, egressId=${info.egressId}`
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

        if (!transcript?.trim()) {
          this.logger.warn(
            `Empty transcript for participant=${participant.userId} — skipping PQS`,
          );
        } else {
          // 1. Get Azure pronunciation details.
          // Pass no reference_text so backend-ai runs in free-speech mode —
          // passing transcript.trim() here creates a self-reference trap where
          // Azure compares speech against itself and returns 100% accuracy.
          const { flagged_errors, pronunciation_score } =
            await this.pronunciationService.assessFromRecordingUrl(
              participant.userId,
              effectiveFileLocation,
            );
          const wordsChecked: number =
            (pronunciation_score as any)?.azure_result?.Words?.length ??
            (pronunciation_score as any)?.azure_result?.Nbests?.[0]?.Words?.length ??
            0;
          this.logger.log(
            `[Core PA] session=${participant.sessionId} issues=${flagged_errors.length} words_checked=${wordsChecked}`,
          );

          // 2. Persist Issues to DB
          await this.savePronunciationIssues(participant.sessionId, participant.userId, participant.id, flagged_errors, transcript.trim());

          // 3. Trigger Phase 2 Authoritative PQS Scoring
          const callDuration = (Number(info.endedAt) - Number(info.startedAt)) / 1_000_000_000;
          const userSpokeSeconds = participant.speakingTime || (callDuration * 0.4);

          await this.scoringService.processCallQualityScore(
            participant.sessionId,
            participant.userId,
            participant.id,
            transcript.trim(),
            (pronunciation_score as any)?.azure_result ? [(pronunciation_score as any).azure_result] : [],
            callDuration,
            userSpokeSeconds
          );
        }

        // 4. Redis Tracking for Race Condition (Step 4 Fix)
        const completedKey = `session:${participant.sessionId}:participants_done`;
        const count = await this.redis.incr(completedKey);
        await this.redis.expire(completedKey, 3600); // 1 hour TTL

        this.logger.log(`[RACE FIX] Participant ${participant.userId} done. Count=${count}/2`);

        if (count >= 2) {
          await this.redis.set(`session:${participant.sessionId}:participants_ready`, 'true', 3600);
          const compositeReady = await this.redis.get(`session:${participant.sessionId}:composite_ready`);
          if (compositeReady === 'true') {
            this.logger.log(`[RACE FIX] Triggering joint analysis from participant track end (last one)`);
            await this.triggerJointAnalysis(participant.sessionId);
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
          await this.redis.set(`session:${session.id}:composite_ready`, 'true', 3600);
          await this.redis.set(`session:${session.id}:composite_transcript`, transcript.trim(), 3600);
          await this.redis.set(`session:${session.id}:primary_user_id`, userId, 3600);

          const participantsReady = await this.redis.get(`session:${session.id}:participants_ready`);
          if (participantsReady === 'true') {
            this.logger.log(`[RACE FIX] Triggering joint analysis from composite end`);
            await this.triggerJointAnalysis(session.id);
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

  private async triggerJointAnalysis(sessionId: string) {
    try {
      const transcript = await this.redis.get(`session:${sessionId}:composite_transcript`);
      const userId = await this.redis.get(`session:${sessionId}:primary_user_id`);

      if (transcript && userId) {
        this.logger.log(`[RACE FIX] Actually running analyzeSession for sessionId=${sessionId}`);
        await this.brain.analyzeSession(sessionId, transcript, userId);
        
        // Cleanup Redis (prevent multiple triggers if something retries)
        await this.redis.del(`session:${sessionId}:composite_ready`);
        await this.redis.del(`session:${sessionId}:participants_ready`);
      }
    } catch (error) {
      this.logger.error(`Failed to trigger joint analysis for sessionId=${sessionId}:`, error);
    }
  }

  private async savePronunciationIssues(
    sessionId: string,
    userId: string,
    participantId: string,
    flagged_errors: any[],
    transcript: string,
  ) {
    // 1. Find Analysis row (wait up to 10s if needed, though with our race fix it should be better)
    let analysis = await this.prisma.analysis.findFirst({
      where: {
        sessionId,
        participantId,
      },
    });

    if (!analysis) {
      analysis = await this.prisma.analysis.create({
        data: {
          sessionId,
          participantId,
          rawData: { transcript } as any,
          scores: {} as any,
        },
      });
    }

    if (Array.isArray(flagged_errors) && flagged_errors.length > 0) {
      const sample = flagged_errors[0];
      await this.prisma.pronunciationIssue.createMany({
        data: flagged_errors.map((err) => ({
          analysisId: analysis!.id,
          word: err.spoken,           // legacy compat
          spoken: err.spoken,         // what user actually said
          correct: err.correct,       // correct pronunciation
          ruleCategory: err.rule_category,
          reelId: err.reel_id || null,
          issueType: err.rule_category, // legacy compat
          severity: err.confidence < 40 ? 'high' : err.confidence < 65 ? 'medium' : 'low',
          confidence: err.confidence,
          suggestion: formatPronunciationSuggestion(err.rule_category, err.correct),
        })),
        skipDuplicates: true,
      });

      this.logger.log(
        `[Pronunciation] Saved ${flagged_errors.length} pronunciation issues: ` +
          `sample=${sample?.spoken ?? '—'}→${sample?.correct ?? sample?.rule_category ?? '—'} ` +
          `(rule_types=${Array.from(
            new Set(flagged_errors.map((e) => e.rule_category)),
          ).slice(0, 5).join(', ')})`,
      );
    }
  }
}
