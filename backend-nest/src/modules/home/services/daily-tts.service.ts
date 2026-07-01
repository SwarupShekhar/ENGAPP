import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { createHash } from 'crypto';
import { AzureStorageService } from '../../../integrations/azure-storage.service';
import { RedisService } from '../../../redis/redis.service';
import { aiEngineAuthHeaders } from '../../../common/ai-engine-auth';
import {
  buildPhraseListenScript,
  buildWordListenScript,
  DAILY_LISTEN_VOICES,
  DailyListenAudioMap,
  DailyListenVoice,
} from '../utils/daily-listen-script';
import { PhraseOfDay } from '../types/daily-content.types';
import { WordOfTheDay } from '../types/daily-content.types';

type DailyKind = 'phrase' | 'word';

@Injectable()
export class DailyTtsService {
  private readonly logger = new Logger(DailyTtsService.name);
  private readonly aiBackendUrl: string;
  private readonly aiHeaders: Record<string, string>;
  private readonly enabled: boolean;
  private readonly inFlight = new Map<string, Promise<DailyListenAudioMap | undefined>>();

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
    private readonly redis: RedisService,
    private readonly azureStorage: AzureStorageService,
  ) {
    this.aiBackendUrl =
      this.config.get<string>('AI_ENGINE_URL') || 'http://localhost:8001';
    this.aiHeaders = aiEngineAuthHeaders(this.config);
    this.enabled = this.config.get<string>('KITTEN_TTS_ENABLED') !== 'false';
  }

  /**
   * Fast path: return SAS URLs when metadata exists. Optionally block to bake on
   * first content resolution; otherwise bake in the background.
   */
  async resolveListenAudio(
    kind: DailyKind,
    dateKey: string,
    content: PhraseOfDay | WordOfTheDay,
    options: { blockOnMissing: boolean },
  ): Promise<DailyListenAudioMap | undefined> {
    if (!this.enabled) return undefined;

    const script =
      kind === 'phrase'
        ? buildPhraseListenScript(content as PhraseOfDay)
        : buildWordListenScript(content as WordOfTheDay);
    const scriptHash = createHash('sha256').update(script).digest('hex').slice(0, 16);
    const existing = await this.readUrlsFromMeta(kind, dateKey, scriptHash);

    if (this.isComplete(existing)) {
      return existing;
    }

    if (options.blockOnMissing) {
      await this.purgePreviousDayIfNeeded(dateKey);
      return this.ensureAudioForScript(kind, dateKey, script);
    }

    void this.scheduleBake(kind, dateKey, script);
    return existing;
  }

  private scheduleBake(
    kind: DailyKind,
    dateKey: string,
    script: string,
  ): void {
    const flightKey = `${kind}:${dateKey}:${createHash('sha256').update(script).digest('hex').slice(0, 16)}`;
    if (this.inFlight.has(flightKey)) return;

    const job = this.ensureAudioForScript(kind, dateKey, script)
      .catch((error) => {
        this.logger.warn(
          `Background daily TTS bake failed kind=${kind} date=${dateKey}: ${(error as Error).message}`,
        );
        return undefined;
      })
      .finally(() => {
        this.inFlight.delete(flightKey);
      });

    this.inFlight.set(flightKey, job);
  }

  private async ensureAudioForScript(
    kind: DailyKind,
    dateKey: string,
    script: string,
  ): Promise<DailyListenAudioMap | undefined> {
    const scriptHash = createHash('sha256').update(script).digest('hex').slice(0, 16);
    const existing = await this.readUrlsFromMeta(kind, dateKey, scriptHash);
    if (this.isComplete(existing)) {
      return existing;
    }

    const voiceResults = await Promise.all(
      DAILY_LISTEN_VOICES.map((voice) =>
        this.ensureVoiceAudio(kind, dateKey, script, scriptHash, voice),
      ),
    );

    const urls = {} as DailyListenAudioMap;
    for (const result of voiceResults) {
      if (result) {
        urls[result.voice] = result.url;
      }
    }

    return Object.keys(urls).length ? urls : undefined;
  }

  private async ensureVoiceAudio(
    kind: DailyKind,
    dateKey: string,
    script: string,
    scriptHash: string,
    voice: DailyListenVoice,
  ): Promise<{ voice: DailyListenVoice; url: string } | undefined> {
    const blobKey = this.blobKey(kind, dateKey, voice);
    const metaKey = this.metaRedisKey(kind, dateKey, voice);
    const cachedMeta = await this.redis.get(metaKey);

    if (cachedMeta) {
      try {
        const parsed = JSON.parse(cachedMeta) as {
          blobKey: string;
          scriptHash: string;
        };
        if (parsed.scriptHash === scriptHash && parsed.blobKey) {
          const url = await this.azureStorage.getDownloadUrl(parsed.blobKey);
          return { voice, url };
        }
      } catch {
        // Re-bake below when metadata is stale or malformed.
      }
    }

    const mp3 = await this.synthesizeKitten(script, voice);
    if (!mp3.length) {
      this.logger.warn(`Daily TTS bake failed kind=${kind} date=${dateKey} voice=${voice}`);
      return undefined;
    }

    const uploadedUrl = await this.azureStorage.uploadFile(mp3, blobKey, 'audio/mpeg');
    const ttl = this.secondsUntilNextUtcDayFromKey(dateKey);
    await this.redis.set(
      metaKey,
      JSON.stringify({ blobKey, scriptHash, voice, kind, dateKey }),
      ttl,
    );
    this.logger.log(`Daily TTS baked kind=${kind} date=${dateKey} voice=${voice}`);
    return { voice, url: uploadedUrl };
  }

  private async readUrlsFromMeta(
    kind: DailyKind,
    dateKey: string,
    scriptHash: string,
  ): Promise<DailyListenAudioMap | undefined> {
    const urls = {} as DailyListenAudioMap;

    await Promise.all(
      DAILY_LISTEN_VOICES.map(async (voice) => {
        const metaKey = this.metaRedisKey(kind, dateKey, voice);
        const cachedMeta = await this.redis.get(metaKey);
        if (!cachedMeta) return;
        try {
          const parsed = JSON.parse(cachedMeta) as {
            blobKey: string;
            scriptHash: string;
          };
          if (parsed.scriptHash === scriptHash && parsed.blobKey) {
            urls[voice] = await this.azureStorage.getDownloadUrl(parsed.blobKey);
          }
        } catch {
          // Ignore malformed metadata.
        }
      }),
    );

    return Object.keys(urls).length ? urls : undefined;
  }

  private isComplete(map?: DailyListenAudioMap): boolean {
    if (!map) return false;
    return DAILY_LISTEN_VOICES.every((voice) => Boolean(map[voice]));
  }

  private async synthesizeKitten(text: string, voice: DailyListenVoice): Promise<Buffer> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.aiBackendUrl}/api/tts/kitten/speak`,
          { text, voice },
          {
            headers: this.aiHeaders,
            timeout: 90_000,
          },
        ),
      );
      const b64 = (response.data?.audio_base64 as string | undefined) ?? '';
      if (!b64) return Buffer.alloc(0);
      return Buffer.from(b64, 'base64');
    } catch (error) {
      this.logger.warn(
        `Kitten synth failed voice=${voice}: ${(error as Error).message}`,
      );
      return Buffer.alloc(0);
    }
  }

  private async purgePreviousDayIfNeeded(dateKey: string): Promise<void> {
    const flagKey = `engr:daily-tts:purged:${dateKey}`;
    const claimed = await this.redis.setNx(flagKey, '1', this.secondsUntilNextUtcDayFromKey(dateKey));
    if (!claimed) return;

    const previousDateKey = this.previousUtcDateKey(dateKey);
    await Promise.all(
      (['phrase', 'word'] as const).flatMap((kind) =>
        DAILY_LISTEN_VOICES.map(async (voice) => {
          const blobKey = this.blobKey(kind, previousDateKey, voice);
          const metaKey = this.metaRedisKey(kind, previousDateKey, voice);
          await this.azureStorage.deleteFile(blobKey);
          await this.redis.del(metaKey);
        }),
      ),
    );
    this.logger.log(`Purged previous daily TTS blobs for ${previousDateKey}`);
  }

  private blobKey(kind: DailyKind, dateKey: string, voice: DailyListenVoice): string {
    return `tts/daily/${dateKey}/${kind}-${voice}.mp3`;
  }

  private metaRedisKey(kind: DailyKind, dateKey: string, voice: DailyListenVoice): string {
    return `engr:daily-tts:${kind}:${dateKey}:${voice}`;
  }

  private previousUtcDateKey(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 1, d - 1));
    return prev.toISOString().slice(0, 10);
  }

  private secondsUntilNextUtcDayFromKey(dateKey: string): number {
    const [y, m, d] = dateKey.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const now = Date.now();
    return Math.ceil(Math.max(60_000, next.getTime() - now) / 1000);
  }
}
