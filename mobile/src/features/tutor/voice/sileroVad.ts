/**
 * Silero VAD v5 ONNX detector.
 *
 * Inputs per frame:
 *   - input: float32 [1, 512] — PCM samples in [-1, 1] @ 16 kHz
 *   - sr:    int64   [1]      — sample rate (16000)
 *   - state: float32 [2, 1, 128] — LSTM state (zeros at start of utterance)
 *
 * Outputs:
 *   - output: float32 [1, 1]    — speech probability
 *   - stateN: float32 [2, 1, 128] — new LSTM state for next frame
 *
 * The model file (`silero_vad.onnx`) must be bundled at
 * `mobile/assets/models/silero_vad.onnx`. Run `npm run fetch-silero-vad` once.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';

let ort: any = null;
try {
  // Lazy import so Expo Go / unbuilt dev clients don't crash on missing native module.
  ort = require('onnxruntime-react-native');
} catch (_) {
  ort = null;
}

export const SILERO_FRAME_SAMPLES = 512; // 32 ms @ 16 kHz
export const SILERO_SAMPLE_RATE = 16000;

export type SileroLoadResult =
  | { ok: true; vad: SileroVad }
  | { ok: false; reason: string };

class SileroVad {
  private session: any;
  private state: Float32Array;
  private sr: BigInt64Array;

  constructor(session: any) {
    this.session = session;
    this.state = new Float32Array(2 * 1 * 128);
    this.sr = BigInt64Array.from([BigInt(SILERO_SAMPLE_RATE)]);
  }

  reset(): void {
    this.state = new Float32Array(2 * 1 * 128);
  }

  /** Returns speech probability in [0, 1]. Frame must be exactly 512 samples @ 16 kHz. */
  async processFrame(frame: Float32Array): Promise<number> {
    if (frame.length !== SILERO_FRAME_SAMPLES) {
      throw new Error(
        `Silero VAD expects ${SILERO_FRAME_SAMPLES} samples, got ${frame.length}`,
      );
    }
    const input = new ort.Tensor('float32', frame, [1, SILERO_FRAME_SAMPLES]);
    const srTensor = new ort.Tensor('int64', this.sr, [1]);
    const stateTensor = new ort.Tensor('float32', this.state, [2, 1, 128]);

    const feeds: Record<string, any> = {
      input,
      sr: srTensor,
      state: stateTensor,
    };
    const out = await this.session.run(feeds);
    const stateOut = out.stateN ?? out.state_out ?? out.state;
    if (stateOut?.data instanceof Float32Array) {
      this.state = stateOut.data;
    }
    const probTensor = out.output ?? out.prob;
    const probData = probTensor?.data as Float32Array | undefined;
    return probData && probData.length > 0 ? probData[0] : 0;
  }
}

let cachedLoad: Promise<SileroLoadResult> | null = null;

async function resolveModelUri(): Promise<string | null> {
  try {
    // require('../../../../assets/...') would need a file-extension allowed by metro;
    // metro.config.js registers .onnx as an asset extension.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const moduleRef = require('../../../../assets/models/silero_vad.onnx');
    const asset = Asset.fromModule(moduleRef);
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;
    if (!uri) return null;
    return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  } catch (e) {
    // Asset missing — user hasn't run `npm run fetch-silero-vad`.
    return null;
  }
}

export function loadSileroVad(): Promise<SileroLoadResult> {
  if (cachedLoad) return cachedLoad;
  cachedLoad = (async (): Promise<SileroLoadResult> => {
    if (!ort) {
      return {
        ok: false,
        reason: 'onnxruntime-react-native is not linked; rebuild the dev client',
      };
    }
    const modelPath = await resolveModelUri();
    if (!modelPath) {
      return {
        ok: false,
        reason: 'silero_vad.onnx missing — run `npm run fetch-silero-vad`',
      };
    }
    try {
      const fileInfo = await FileSystem.getInfoAsync(
        modelPath.startsWith('/') ? `file://${modelPath}` : modelPath,
      );
      if (!fileInfo.exists) {
        return { ok: false, reason: `model file not found at ${modelPath}` };
      }
    } catch (_) {
      // Non-fatal — onnxruntime will surface its own load error below.
    }
    try {
      const session = await ort.InferenceSession.create(modelPath);
      return { ok: true, vad: new SileroVad(session) };
    } catch (e: any) {
      return { ok: false, reason: `InferenceSession.create failed: ${e?.message || e}` };
    }
  })();
  return cachedLoad;
}

export function resetSileroLoadCache(): void {
  cachedLoad = null;
}
