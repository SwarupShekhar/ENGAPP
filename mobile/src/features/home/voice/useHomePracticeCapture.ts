import { useCallback, useRef, useState } from 'react';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Speech from 'expo-speech';

export type CaptureState = 'idle' | 'recording' | 'processing';

export type HomePracticeAudioUpload = {
  uri: string;
  mime: string;
  name: string;
};

export type FinishCaptureResult =
  | { ok: true; audio: HomePracticeAudioUpload }
  | { ok: false; reason: 'too_short' | 'no_audio' | 'permission_denied' | 'failed' };

/** Minimum clip length — Azure needs a real utterance, not a tap. */
const MIN_RECORDING_MS = 750;

async function setRecordingAudioMode(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
  });
}

/**
 * Tap-to-record for home carousel (phrase / word / mistake cards).
 * Releases any device TTS and switches expo-av into recording mode before capture.
 */
export function useHomePracticeCapture() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startedAtRef = useRef(0);
  const startPromiseRef = useRef<Promise<boolean> | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>('idle');

  const isRecording = captureState === 'recording';

  const ensureMicReady = useCallback(async (): Promise<boolean> => {
    const perm = await Audio.requestPermissionsAsync();
    if (perm.status !== 'granted' && !perm.granted) {
      return false;
    }
    return true;
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (recordingRef.current) return true;
    if (startPromiseRef.current) return startPromiseRef.current;

    startPromiseRef.current = (async () => {
      const micOk = await ensureMicReady();
      if (!micOk) return false;

      try {
        // Listen uses expo-speech + expo-av playback — must release before recording.
        Speech.stop();
        await setRecordingAudioMode();

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
      } finally {
        startPromiseRef.current = null;
      }
    })();

    return startPromiseRef.current;
  }, [ensureMicReady]);

  const finish = useCallback(async (): Promise<FinishCaptureResult> => {
    if (startPromiseRef.current) {
      try {
        await startPromiseRef.current;
      } catch (_) {}
    }

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
    if (startPromiseRef.current) {
      try {
        await startPromiseRef.current;
      } catch (_) {}
    }
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
