import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

const execFileAsync = promisify(execFile);

/**
 * Downloads audio from URL (or S3 path) and transcribes with Azure Speech (detailed output).
 * Returns plain transcript text for storage and AI analysis.
 */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly aiEngineUrl: string;

  constructor(private readonly config: ConfigService) {
    this.aiEngineUrl =
      this.config.get<string>('AI_ENGINE_URL') || 'http://localhost:8001';
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
    try {
      const res = await fetch(`${this.aiEngineUrl}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(audioUrl);
      if (!res.ok) throw new Error(`Download failed ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.promises.writeFile(rawPath, buf);

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
