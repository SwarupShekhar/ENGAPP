import { useCallback, useRef, useState } from 'react';
import {
  startMayaCapture,
  type MayaCaptureHandle,
} from '../../tutor/voice/mayaAudioCapture';

export type CaptureState = 'idle' | 'recording' | 'processing';

const MIN_RECORDING_MS = 400;

export function useHomePracticeCapture() {
  const handleRef = useRef<MayaCaptureHandle | null>(null);
  const startTimeRef = useRef<number>(0);
  const [captureState, setCaptureState] = useState<CaptureState>('idle');

  const start = useCallback(async () => {
    if (handleRef.current?.isActive()) return;
    setCaptureState('recording');
    startTimeRef.current = Date.now();
    handleRef.current = await startMayaCapture({ onSpeechEnd: () => {} });
  }, []);

  const stop = useCallback(async (): Promise<{ wavBytes: Uint8Array | null; tooShort: boolean }> => {
    const handle = handleRef.current;
    if (!handle?.isActive()) return { wavBytes: null, tooShort: false };
    if (Date.now() - startTimeRef.current < MIN_RECORDING_MS) {
      await handle.cancel();
      setCaptureState('idle');
      return { wavBytes: null, tooShort: true };
    }
    setCaptureState('processing');
    const result = await handle.stop();
    handleRef.current = null;
    setCaptureState('idle');
    return { wavBytes: result.wavBytes, tooShort: false };
  }, []);

  const cancel = useCallback(async () => {
    const handle = handleRef.current;
    if (handle?.isActive()) await handle.cancel();
    handleRef.current = null;
    setCaptureState('idle');
  }, []);

  return { captureState, start, stop, cancel };
}
