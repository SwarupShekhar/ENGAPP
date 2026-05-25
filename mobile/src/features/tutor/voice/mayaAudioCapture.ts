/**
 * Maya hands-free audio capture for Pulse tutor.
 *
 * Pipeline:
 *   react-native-live-audio-stream  (16 kHz int16 mono PCM)
 *      ↓ chunks (base64)
 *   sliced into 512-sample Silero frames
 *      ↓ float32 [-1, 1]
 *   sileroVad.processFrame → speech probability
 *      ↓ speech_start / speech_end events
 *   onSpeechEnd → encodeWav(int16Buffer) → upload to backend
 *
 * Falls back to expo-av metering when:
 *   - native module missing (Expo Go / unbuilt dev client)
 *   - silero_vad.onnx missing
 *   - inference fails to load
 *
 * Caller wires `startMayaCapture(opts)` + holds returned handle.
 * On `handle.stop()` the accumulated PCM is encoded to a WAV `Uint8Array` and returned.
 */

import { Buffer } from 'buffer';
import { Audio } from 'expo-av';
import {
  loadSileroVad,
  SILERO_FRAME_SAMPLES,
  SILERO_SAMPLE_RATE,
} from './sileroVad';
import {
  createRecordingMeteringCallback,
  DEFAULT_VAD_CONFIG,
  resolveVadProvider,
  type VadConfig,
  type VadStatusCallback,
} from './voiceActivityDetector';

let LiveAudioStream: any = null;
try {
  LiveAudioStream = require('react-native-live-audio-stream').default;
} catch (_) {
  LiveAudioStream = null;
}

export type MayaCaptureResult = {
  /** WAV bytes (16 kHz mono 16-bit PCM) ready for upload. Empty when fallback path is used. */
  wavBytes: Uint8Array | null;
  /** Underlying expo-av recording, present only on the metering fallback path. */
  recording: Audio.Recording | null;
  /** Which VAD provider actually ran the turn. */
  providerUsed: 'silero' | 'metering';
};

export type MayaCaptureHandle = {
  stop: () => Promise<MayaCaptureResult>;
  cancel: () => Promise<void>;
  isActive: () => boolean;
};

export type MayaCaptureOptions = {
  onSpeechEnd: () => void;
  onStatus?: VadStatusCallback;
  /** Silero speech probability threshold (default 0.5). */
  speechThreshold?: number;
  /** Min consecutive silence ms before emitting speech_end. Default 700. */
  silenceMs?: number;
  /** Min spoken ms before speech_end can fire. Default 250. */
  minSpeechMs?: number;
  /** When falling back to metering, use this dB config. */
  meteringConfig?: VadConfig;
};

function encodeWav(int16: Int16Array, sampleRate: number): Uint8Array {
  const numFrames = int16.length;
  const buffer = new ArrayBuffer(44 + numFrames * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numFrames * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, numFrames * 2, true);
  for (let i = 0; i < numFrames; i++) {
    view.setInt16(44 + i * 2, int16[i], true);
  }
  return new Uint8Array(buffer);
}

function int16ToFloat32(input: Int16Array, out: Float32Array, offset: number): void {
  for (let i = 0; i < input.length; i++) {
    out[offset + i] = Math.max(-1, Math.min(1, input[i] / 32768));
  }
}

async function startSileroCapture(opts: MayaCaptureOptions): Promise<MayaCaptureHandle | null> {
  if (!LiveAudioStream) return null;

  const loaded = await loadSileroVad();
  if (!loaded.ok) {
    if (__DEV__) console.warn('[MayaCapture] Silero unavailable:', loaded.reason);
    return null;
  }
  const vad = loaded.vad;
  vad.reset();

  const threshold = opts.speechThreshold ?? 0.5;
  const silenceMs = opts.silenceMs ?? 700;
  const minSpeechMs = opts.minSpeechMs ?? 250;

  LiveAudioStream.init({
    sampleRate: SILERO_SAMPLE_RATE,
    channels: 1,
    bitsPerSample: 16,
    audioSource: 6, // VOICE_RECOGNITION on Android; iOS ignored.
    bufferSize: 4096,
  });

  // 16 kHz int16 mono → ~2 ms per sample. Frame is 512 samples = 32 ms.
  let pcmAll: number[] = [];
  let leftover = new Int16Array(0);
  let isSpeaking = false;
  let speechStartMs: number | null = null;
  let silenceStartMs: number | null = null;
  let active = true;
  let endFired = false;

  const onData = async (base64Chunk: string) => {
    if (!active) return;
    let buf: Buffer;
    try {
      buf = Buffer.from(base64Chunk, 'base64');
    } catch {
      return;
    }
    // Convert little-endian int16 buffer to Int16Array.
    const samples = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2));

    // Append to full-utterance buffer.
    for (let i = 0; i < samples.length; i++) pcmAll.push(samples[i]);

    // Combine leftover + new for frame slicing.
    let combined: Int16Array;
    if (leftover.length === 0) {
      combined = samples;
    } else {
      combined = new Int16Array(leftover.length + samples.length);
      combined.set(leftover, 0);
      combined.set(samples, leftover.length);
    }

    let cursor = 0;
    while (cursor + SILERO_FRAME_SAMPLES <= combined.length && active) {
      const slice = combined.subarray(cursor, cursor + SILERO_FRAME_SAMPLES);
      cursor += SILERO_FRAME_SAMPLES;
      const frame = new Float32Array(SILERO_FRAME_SAMPLES);
      int16ToFloat32(slice, frame, 0);
      let prob = 0;
      try {
        prob = await vad.processFrame(frame);
      } catch (e: any) {
        if (__DEV__) console.warn('[MayaCapture] silero inference failed:', e?.message || e);
        continue;
      }
      const now = Date.now();
      if (prob >= threshold) {
        if (!isSpeaking) {
          isSpeaking = true;
          speechStartMs = now;
          silenceStartMs = null;
          opts.onStatus?.('speech_start', { levelDb: prob });
        } else {
          silenceStartMs = null;
        }
      } else if (isSpeaking) {
        if (silenceStartMs === null) silenceStartMs = now;
        const silenceFor = now - silenceStartMs;
        opts.onStatus?.('silence_tick', { levelDb: prob, silenceMs: silenceFor });
        const spokeLongEnough =
          speechStartMs !== null && now - speechStartMs >= minSpeechMs;
        if (silenceFor >= silenceMs && spokeLongEnough && !endFired) {
          endFired = true;
          opts.onStatus?.('speech_end', { silenceMs: silenceFor });
          opts.onSpeechEnd();
        }
      }
    }
    leftover = combined.subarray(cursor).slice();
  };

  // Register listener BEFORE start to avoid losing the first chunk.
  LiveAudioStream.on('data', onData);
  LiveAudioStream.start();

  const teardown = async () => {
    if (!active) return;
    active = false;
    try {
      LiveAudioStream.stop();
    } catch (_) {}
    // No removeListener on this lib; replacing the handler is fine since teardown drops `active`.
  };

  return {
    stop: async () => {
      await teardown();
      const i16 = new Int16Array(pcmAll);
      pcmAll = [];
      return {
        wavBytes: encodeWav(i16, SILERO_SAMPLE_RATE),
        recording: null,
        providerUsed: 'silero' as const,
      };
    },
    cancel: async () => {
      await teardown();
      pcmAll = [];
    },
    isActive: () => active,
  };
}

async function startMeteringCapture(opts: MayaCaptureOptions): Promise<MayaCaptureHandle> {
  const meteringCfg = opts.meteringConfig ?? DEFAULT_VAD_CONFIG;
  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY,
    createRecordingMeteringCallback(opts.onSpeechEnd, opts.onStatus, meteringCfg),
    100,
  );
  let active = true;
  return {
    stop: async () => {
      active = false;
      // expo-av path keeps the m4a file on disk; caller reads URI from the Recording.
      return { wavBytes: null, recording, providerUsed: 'metering' as const };
    },
    cancel: async () => {
      active = false;
      try {
        await recording.stopAndUnloadAsync();
      } catch (_) {}
    },
    isActive: () => active,
  };
}

export async function startMayaCapture(
  opts: MayaCaptureOptions,
): Promise<MayaCaptureHandle> {
  if (resolveVadProvider() === 'silero') {
    const silero = await startSileroCapture(opts);
    if (silero) return silero;
    if (__DEV__) console.warn('[MayaCapture] Falling back to metering VAD');
  }
  return startMeteringCapture(opts);
}
