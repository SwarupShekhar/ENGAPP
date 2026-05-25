/**
 * Ambient module declarations for Maya's Silero VAD pipeline.
 *
 * These packages ship without their own TypeScript types (or are loaded via
 * dynamic `require`), so we widen them to `any` to keep `tsc --noEmit` green.
 * Runtime correctness is enforced inside `sileroVad.ts` / `mayaAudioCapture.ts`.
 */

declare module 'onnxruntime-react-native';
declare module 'react-native-live-audio-stream';

/** Silero VAD ONNX model bundled as an Expo asset (registered in metro.config.js). */
declare module '*.onnx' {
  const asset: number;
  export default asset;
}
