import { useCallback, useRef, useState } from 'react';
import { Audio } from 'expo-av';

export type CaptureState = 'idle' | 'recording' | 'processing';

export type HomePracticeAudioUpload = {
  uri: string;
  mime: string;
  name: string;
};

export type FinishCaptureResult =
  | { ok: true; audio: HomePracticeAudioUpload }
  | { ok: false; reason: 'too_short' | 'no_audio' | 'permission_denied' | 'failed' };

/** Minimum hold time before stop — Azure needs real speech in the clip. */
const MIN_RECORDING_MS = 900;

/**
 * Simple expo-av recording (same path as PracticeTaskScreen).
 * Avoids Maya VAD / Silero — hold gestures inside ScrollView are unreliable on Android.
 */
export function useHomePracticeCapture() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startedAtRef = useRef(0);
  const [captureState, setCaptureState] = useState<CaptureState>('idle');

  const isRecording = captureState === 'recording';

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

  const start = useCallback(async (): Promise<boolean> => {
    if (recordingRef.current) return true;
    const micOk = await ensureMicReady();
    if (!micOk) return false;

    try {
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      startedAtRef.current = Date.now();
      setCaptureState('recording');
      return true;
    } catch (e) {
      if (__DEV__) console.warn('[HomePractice] start recording failed:', e);
      recordingRef.current = null;
      setCaptureState('idle');
      return false;
    }
  }, [ensureMicReady]);

  const finish = useCallback(async (): Promise<FinishCaptureResult> => {
    const recording = recordingRef.current;
    if (!recording) {
      return { ok: false, reason: 'no_audio' };
    }

    const elapsed = Date.now() - startedAtRef.current;
    if (elapsed < MIN_RECORDING_MS) {
      try {
        await recording.stopAndUnloadAsync();
      } catch (_) {}
      recordingRef.current = null;
      setCaptureState('idle');
      return { ok: false, reason: 'too_short' };
    }

    setCaptureState('processing');
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;
      setCaptureState('idle');
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (_) {
        /* non-fatal — Listen uses playback mode */
      }
      if (!uri) return { ok: false, reason: 'no_audio' };
      return {
        ok: true,
        audio: { uri, mime: 'audio/m4a', name: 'capture.m4a' },
      };
    } catch (e) {
      if (__DEV__) console.warn('[HomePractice] stop recording failed:', e);
      recordingRef.current = null;
      setCaptureState('idle');
      return { ok: false, reason: 'failed' };
    }
  }, []);

  const cancel = useCallback(async () => {
    const recording = recordingRef.current;
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch (_) {}
    }
    recordingRef.current = null;
    setCaptureState('idle');
  }, []);

  return { captureState, isRecording, start, finish, cancel };
}
