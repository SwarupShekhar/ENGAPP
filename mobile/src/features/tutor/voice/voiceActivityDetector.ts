/**
 * Voice activity detection for Maya auto end-of-turn.
 *
 * - **metering** (default): expo-av dB metering — works today, no native add-ons.
 * - **silero** (future): enterprise-grade VAD via ONNX on-device (e.g. sherpa-onnx /
 *   @runanywhere/onnx). Requires custom dev client + native build; falls back to metering
 *   until integrated.
 *
 * Set EXPO_PUBLIC_VAD_PROVIDER=silero when native Silero module is linked.
 */

import type { Audio } from 'expo-av';

export type VadProvider = 'metering' | 'silero';

export type VadConfig = {
  speechThresholdDb: number;
  silenceThresholdDb: number;
  silenceDurationMs: number;
  minSpeechMs: number;
};

export const DEFAULT_VAD_CONFIG: VadConfig = {
  speechThresholdDb: -45,
  silenceThresholdDb: -50,
  silenceDurationMs: 800,
  minSpeechMs: 200,
};

export type VadStatusCallback = (
  status: 'speech_start' | 'speech_end' | 'silence_tick',
  meta?: { levelDb?: number; silenceMs?: number },
) => void;

export type MeteringStatus = { metering?: number };

export function resolveVadProvider(): VadProvider {
  const env = process.env.EXPO_PUBLIC_VAD_PROVIDER?.toLowerCase();
  if (env === 'silero') return 'silero';
  return 'metering';
}

let sileroFallbackWarned = false;

/**
 * Returns metering callback for Audio.Recording.createAsync.
 * Silero: logs once and uses metering until native Silero is wired.
 */
export function createRecordingMeteringCallback(
  onEndOfSpeech: () => void,
  onStatus?: VadStatusCallback,
  config: VadConfig = DEFAULT_VAD_CONFIG,
): (status: MeteringStatus) => void {
  const provider = resolveVadProvider();
  if (provider === 'silero' && !sileroFallbackWarned) {
    sileroFallbackWarned = true;
    console.warn(
      '[VAD] EXPO_PUBLIC_VAD_PROVIDER=silero but Silero native module is not linked; using metering VAD. See voiceActivityDetector.ts',
    );
  }

  let isSpeaking = false;
  let silenceStart: number | null = null;
  let speechStart: number | null = null;

  return (status: MeteringStatus) => {
    if (status.metering === undefined) return;
    const level = status.metering;

    if (level > config.speechThresholdDb) {
      if (!isSpeaking) {
        isSpeaking = true;
        speechStart = Date.now();
        silenceStart = null;
        onStatus?.('speech_start', { levelDb: level });
      }
    }

    if (level < config.silenceThresholdDb && isSpeaking) {
      if (silenceStart === null) {
        silenceStart = Date.now();
      } else {
        const silenceMs = Date.now() - silenceStart;
        onStatus?.('silence_tick', { levelDb: level, silenceMs });
        if (silenceMs >= config.silenceDurationMs) {
          const spokeLongEnough =
            speechStart !== null &&
            Date.now() - speechStart >= config.minSpeechMs;
          if (spokeLongEnough) {
            onStatus?.('speech_end', { silenceMs });
            onEndOfSpeech();
          }
          isSpeaking = false;
          silenceStart = null;
          speechStart = null;
        }
      }
    }
  };
}

/** Placeholder for future Silero ONNX integration (custom dev client). */
export type SileroVadPlan = {
  library: 'react-native-sherpa-onnx' | '@runanywhere/onnx' | 'expo-sherpa-onnx';
  notes: string;
};

export const SILERO_VAD_INTEGRATION_PLAN: SileroVadPlan = {
  library: 'react-native-sherpa-onnx',
  notes:
    'Add native module, load silero_vad.onnx, process 512-sample frames at 16kHz. ' +
    'Call onEndOfSpeech when probability < threshold for N frames. Until then use metering.',
};
