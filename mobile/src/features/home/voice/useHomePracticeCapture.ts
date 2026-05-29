import { useCallback, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import {
  startMayaCapture,
  type MayaCaptureHandle,
  type MayaCaptureResult,
} from '../../tutor/voice/mayaAudioCapture';

export type CaptureState = 'idle' | 'recording' | 'processing';

export type HomePracticeAudioUpload = {
  uri: string;
  mime: string;
  name: string;
};

export type FinishCaptureResult =
  | { ok: true; audio: HomePracticeAudioUpload }
  | { ok: false; reason: 'too_short' | 'no_audio' | 'permission_denied' | 'failed' };

const MIN_RECORDING_MS = 400;

async function captureResultToUpload(
  result: MayaCaptureResult,
): Promise<HomePracticeAudioUpload | null> {
  if (result.providerUsed === 'silero' && result.wavBytes && result.wavBytes.length > 0) {
    const base64 = Buffer.from(result.wavBytes).toString('base64');
    const uri = `${FileSystem.cacheDirectory}home-practice-${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { uri, mime: 'audio/wav', name: 'capture.wav' };
  }

  if (result.recording) {
    try {
      const status = await result.recording.getStatusAsync();
      if (status.isRecording || status.isDoneRecording) {
        await result.recording.stopAndUnloadAsync();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        !msg.includes('already been unloaded') &&
        !msg.includes('Recorder does not exist')
      ) {
        if (__DEV__) console.warn('[HomePractice] recording unload:', msg);
      }
    }
    const uri = result.recording.getURI();
    if (uri) {
      return { uri, mime: 'audio/m4a', name: 'capture.m4a' };
    }
  }

  return null;
}

export function useHomePracticeCapture() {
  const handleRef = useRef<MayaCaptureHandle | null>(null);
  const startTimeRef = useRef<number>(0);
  const [captureState, setCaptureState] = useState<CaptureState>('idle');

  const ensureMicReady = useCallback(async (): Promise<boolean> => {
    const perm = await Audio.requestPermissionsAsync();
    if (perm.status !== 'granted' && !perm.granted) {
      return false;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    return true;
  }, []);

  /** Returns false if mic permission denied or capture could not start. */
  const start = useCallback(async (): Promise<boolean> => {
    if (handleRef.current?.isActive()) return true;
    const micOk = await ensureMicReady();
    if (!micOk) return false;

    startTimeRef.current = Date.now();
    try {
      const handle = await startMayaCapture({ onSpeechEnd: () => {} });
      handleRef.current = handle;
      setCaptureState('recording');
      return true;
    } catch (e) {
      if (__DEV__) console.warn('[HomePractice] start capture failed:', e);
      handleRef.current = null;
      setCaptureState('idle');
      return false;
    }
  }, [ensureMicReady]);

  const finish = useCallback(async (): Promise<FinishCaptureResult> => {
    let handle = handleRef.current;
    if (!handle?.isActive()) {
      // Press-out can beat async startMayaCapture on slow devices.
      for (let i = 0; i < 12 && !handle?.isActive(); i += 1) {
        await new Promise((r) => setTimeout(r, 50));
        handle = handleRef.current;
      }
    }
    if (!handle?.isActive()) {
      handleRef.current = null;
      setCaptureState('idle');
      return { ok: false, reason: 'no_audio' };
    }

    if (Date.now() - startTimeRef.current < MIN_RECORDING_MS) {
      try {
        await handle.cancel();
      } catch (_) {}
      handleRef.current = null;
      setCaptureState('idle');
      return { ok: false, reason: 'too_short' };
    }

    setCaptureState('processing');
    try {
      const result = await handle.stop();
      handleRef.current = null;
      const audio = await captureResultToUpload(result);
      setCaptureState('idle');
      if (!audio) return { ok: false, reason: 'no_audio' };
      return { ok: true, audio };
    } catch (e) {
      if (__DEV__) console.warn('[HomePractice] stop capture failed:', e);
      handleRef.current = null;
      setCaptureState('idle');
      return { ok: false, reason: 'failed' };
    }
  }, []);

  const cancel = useCallback(async () => {
    const handle = handleRef.current;
    if (handle?.isActive()) {
      try {
        await handle.cancel();
      } catch (_) {}
    }
    handleRef.current = null;
    setCaptureState('idle');
  }, []);

  return { captureState, start, finish, cancel };
}
