import { useCallback, useRef, useState } from 'react';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { fetchErrorSpeak } from '../../../api/tts';
import { getOrFetchTtsFileUri } from '../../../utils/ttsAudioCache';

const cachedUris = new Map<string, string>();
const SERVER_BUDGET_MS = 3500;

async function hashInput(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

async function setPlaybackAudioMode(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
    });
  } catch (e) {
    if (__DEV__) console.warn('[HomePractice] playback audio mode:', e);
  }
}

export function useHomePracticeTts() {
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const stop = useCallback(async () => {
    Speech.stop();
    activeKeyRef.current = null;
    setPlayingKey(null);
    const s = soundRef.current;
    soundRef.current = null;
    if (s) {
      try {
        await s.stopAsync();
        await s.unloadAsync();
      } catch (_) {}
    }
  }, []);

  const speak = useCallback(
    async (key: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (activeKeyRef.current === key) {
        await stop();
        return;
      }

      await stop();
      activeKeyRef.current = key;
      setPlayingKey(key);
      await setPlaybackAudioMode();

      const clearPlaying = () => {
        if (activeKeyRef.current === key) {
          activeKeyRef.current = null;
          setPlayingKey(null);
        }
      };

      const textDigest = (await hashInput(trimmed)).slice(0, 16);
      const storageKey = `${key}:${textDigest}`;
      const fetchB64 = () => fetchErrorSpeak(trimmed).then((r) => r.audio_base64 ?? '');

      const playUri = async (uri: string): Promise<boolean> => {
        if (activeKeyRef.current !== key) return false;

        let sound: Audio.Sound;
        try {
          ({ sound } = await Audio.Sound.createAsync(
            { uri },
            { shouldPlay: true, volume: 1.0 },
          ));
        } catch {
          cachedUris.delete(storageKey);
          await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
          return false;
        }

        if (activeKeyRef.current !== key) {
          sound.unloadAsync().catch(() => {});
          return false;
        }

        Speech.stop();
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish && activeKeyRef.current === key) {
            clearPlaying();
            sound.unloadAsync().catch(() => {});
            soundRef.current = null;
          }
        });
        return true;
      };

      const cached = cachedUris.get(storageKey);
      if (cached && (await playUri(cached))) {
        return;
      }

      const serverTask = getOrFetchTtsFileUri(storageKey, fetchB64);
      const serverUri = await Promise.race([
        serverTask,
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), SERVER_BUDGET_MS),
        ),
      ]);

      if (serverUri) {
        cachedUris.set(storageKey, serverUri);
        if (activeKeyRef.current === key && (await playUri(serverUri))) {
          return;
        }
      }

      if (activeKeyRef.current !== key) return;

      Speech.speak(trimmed, {
        language: 'en-US',
        rate: 0.78,
        onDone: clearPlaying,
        onStopped: clearPlaying,
        onError: clearPlaying,
      });

      // Finish server fetch in background for a higher-quality replay on the next tap.
      void serverTask
        .then((uri) => {
          if (uri) cachedUris.set(storageKey, uri);
        })
        .catch(() => {});
    },
    [stop],
  );

  return { playingKey, speak, stop };
}
