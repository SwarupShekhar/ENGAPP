import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { aiEngineAuthHeaders } from '../../common/ai-engine-auth';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

const execFileAsync = promisify(execFile);

const DOWNLOAD_RETRIES = 8;
const DOWNLOAD_BASE_DELAY_MS = 1500;

/**
 * Downloads audio from URL (or S3 path) and transcribes with Azure Speech (detailed output).
 * Returns plain transcript text for storage and AI analysis.
 */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly aiEngineUrl: string;
  private readonly aiHeaders: Record<string, string>;

  constructor(private readonly config: ConfigService) {
    this.aiEngineUrl =
      this.config.get<string>('AI_ENGINE_URL') || 'http://localhost:8001';
    this.aiHeaders = aiEngineAuthHeaders(this.config);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isAzureBlobUrl(url: string): boolean {
    try {
      const u = new URL(url);
      return u.hostname.endsWith('.blob.core.windows.net');
    } catch {
      return false;
    }
  }

  private isRetryableDownloadError(err: unknown): boolean {
    const message = String((err as any)?.message ?? err ?? '').toLowerCase();
    const status = Number((err as any)?.statusCode ?? (err as any)?.status ?? 0);
    if ([404, 408, 409, 412, 429, 500, 502, 503, 504].includes(status)) {
      return true;
    }
    return (
      message.includes('409') ||
      message.includes('404') ||
      message.includes('lease') ||
      message.includes('conflict') ||
      message.includes('not found') ||
      message.includes('download failed') ||
      message.includes('econnreset') ||
      message.includes('etimedout')
    );
  }

  /**
   * Authenticated Azure Blob download with retries.
   * LiveKit egress_ended often fires before the blob is fully committed (HTTP 409).
   */
  private async downloadAzureBlobToFile(
    audioUrl: string,
    targetPath: string,
  ): Promise<void> {
    const accountName =
      this.config.get<string>('AZURE_STORAGE_ACCOUNT_NAME') ??
      this.config.get<string>('LIVEKIT_EGRESS_AZURE_ACCOUNT_NAME');
    const accountKey =
      this.config.get<string>('AZURE_STORAGE_ACCOUNT_KEY') ??
      this.config.get<string>('LIVEKIT_EGRESS_AZURE_ACCOUNT_KEY');

    if (!accountName || !accountKey) {
      throw new Error(
        'Azure blob credentials missing (AZURE_STORAGE_ACCOUNT_NAME/KEY)',
      );
    }

    const u = new URL(audioUrl);
    const parts = u.pathname.replace(/^\/+/, '').split('/');
    const container = parts[0];
    const blobPath = parts.slice(1).join('/');
    if (!container || !blobPath) {
      throw new Error(`Invalid Azure blob URL path: ${u.pathname}`);
    }

    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    const service = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      credential,
    );
    const blob = service.getContainerClient(container).getBlobClient(blobPath);

    let lastError: unknown;
    for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt++) {
      try {
        const exists = await blob.exists();
        if (!exists) {
          throw Object.assign(new Error('Blob not found yet'), {
            statusCode: 404,
          });
        }
        const props = await blob.getProperties();
        const size = Number(props.contentLength ?? 0);
        if (size <= 0) {
          throw Object.assign(new Error('Blob size is 0 (still writing)'), {
            statusCode: 409,
          });
        }
        await blob.downloadToFile(targetPath);
        if (attempt > 1) {
          this.logger.log(
            `Azure blob download ok after retry attempt=${attempt} size=${size}`,
          );
        }
        return;
      } catch (e) {
        lastError = e;
        if (!this.isRetryableDownloadError(e) || attempt >= DOWNLOAD_RETRIES) {
          break;
        }
        const delay = Math.min(
          DOWNLOAD_BASE_DELAY_MS * 2 ** (attempt - 1),
          20_000,
        );
        this.logger.warn(
          `Azure blob download retry attempt=${attempt} delayMs=${delay} err=${(e as Error)?.message ?? e}`,
        );
        await this.sleep(delay);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError));
  }

  private async downloadHttpToFile(
    audioUrl: string,
    targetPath: string,
  ): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt++) {
      try {
        const res = await fetch(audioUrl);
        if (!res.ok) {
          throw Object.assign(new Error(`Download failed ${res.status}`), {
            statusCode: res.status,
          });
        }
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0) {
          throw Object.assign(new Error('Downloaded empty body'), {
            statusCode: 409,
          });
        }
        await fs.promises.writeFile(targetPath, buf);
        return;
      } catch (e) {
        lastError = e;
        if (!this.isRetryableDownloadError(e) || attempt >= DOWNLOAD_RETRIES) {
          break;
        }
        const delay = Math.min(
          DOWNLOAD_BASE_DELAY_MS * 2 ** (attempt - 1),
          20_000,
        );
        this.logger.warn(
          `HTTP download retry attempt=${attempt} delayMs=${delay} err=${(e as Error)?.message ?? e}`,
        );
        await this.sleep(delay);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError));
  }

  /**
   * Transcribe audio file at local path (WAV 16kHz mono preferred). Returns full transcript text.
   */
  async transcribeFileToText(filePath: string): Promise<string> {
    const key = this.config.get<string>('AZURE_SPEECH_KEY');
    const region = this.config.get<string>('AZURE_SPEECH_REGION') ?? 'eastus';
    if (!key) {
      throw new Error('AZURE_SPEECH_KEY not set');
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechRecognitionLanguage = 'en-US';
    speechConfig.outputFormat = sdk.OutputFormat.Detailed;

    const wavBuffer = fs.readFileSync(filePath);
    const audioConfig = sdk.AudioConfig.fromWavFileInput(wavBuffer);
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    return new Promise((resolve, reject) => {
      const parts: string[] = [];
      recognizer.recognized = (_s, e) => {
        if (
          e.result.reason === sdk.ResultReason.RecognizedSpeech &&
          e.result.text
        ) {
          parts.push(e.result.text);
        }
      };
      recognizer.canceled = (_s, e) => {
        if (e.reason === sdk.CancellationReason.Error) {
          reject(new Error(e.errorDetails));
        }
      };
      recognizer.sessionStopped = () => {
        recognizer.stopContinuousRecognitionAsync(() => {
          recognizer.close();
          resolve(parts.join(' ').trim());
        }, reject);
      };
      recognizer.startContinuousRecognitionAsync(
        () => {},
        (err) => {
          recognizer.close();
          reject(err);
        },
      );
    });
  }

  /**
   * Download audio from HTTPS URL to temp file, convert to WAV if needed (ffmpeg), then transcribe.
   */
  async transcribeFromUrl(
    audioUrl: string,
    opts?: { userId?: string; sessionId?: string; language?: string },
  ): Promise<string> {
    // Prefer AI engine ASR (backend-ai) so we don't depend on ffmpeg/Azure SDK in Nest runtime.
    // AI engine also retries Azure blob 409s.
    try {
      const res = await fetch(`${this.aiEngineUrl}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.aiHeaders },
        body: JSON.stringify({
          audio_url: audioUrl,
          language: opts?.language ?? 'en-US',
          user_id: opts?.userId ?? 'system',
          session_id: opts?.sessionId ?? 'system',
        }),
      });
      if (!res.ok) {
        throw new Error(`AI engine transcribe failed ${res.status}`);
      }
      const body: any = await res.json();
      const text = body?.data?.text ?? body?.data?.data?.text;
      if (typeof text === 'string') {
        const trimmed = text.trim();
        if (trimmed.length > 0) return trimmed;
        return ''; // valid but empty transcript
      }
      throw new Error('AI engine transcribe returned unexpected payload');
    } catch (e: any) {
      this.logger.warn(
        `AI engine /api/transcribe failed; falling back to local STT: ${e?.message ?? e}`,
      );
    }

    const tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'eng-egress-'),
    );
    const ext = path.extname(new URL(audioUrl).pathname) || '.mp4';
    const rawPath = path.join(tmpDir, `audio${ext}`);
    const wavPath = path.join(tmpDir, 'audio.wav');

    try {
      if (this.isAzureBlobUrl(audioUrl)) {
        await this.downloadAzureBlobToFile(audioUrl, rawPath);
      } else {
        await this.downloadHttpToFile(audioUrl, rawPath);
      }

      const needConvert = /\.(mp4|m4a|ogg|webm)$/i.test(ext);
      if (needConvert) {
        try {
          await execFileAsync('ffmpeg', [
            '-y',
            '-i',
            rawPath,
            '-vn',
            '-acodec',
            'pcm_s16le',
            '-ar',
            '16000',
            '-ac',
            '1',
            wavPath,
          ]);
        } catch (ffmpegErr) {
          this.logger.warn(
            'ffmpeg not available or failed; trying raw file as WAV',
            ffmpegErr,
          );
          await fs.promises.copyFile(rawPath, wavPath);
        }
      } else {
        await fs.promises.copyFile(rawPath, wavPath);
      }

      const text = await this.transcribeFileToText(wavPath);
      return text;
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true }).catch(() => {});
    }
  }
}
