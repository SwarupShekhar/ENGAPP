import { useCallback, useRef, useState } from 'react';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { fetchErrorSpeak } from '../../../api/tts';
import { getOrFetchTtsFileUri } from '../../../utils/ttsAudioCache';

const cachedUris = new Map<string, string>();

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
  /** Blocks overlapping speak() calls (double-tap idempotency). */
  const speakBusyRef = useRef(false);
  /** Bumps on every stop/speak so stale async work cannot clear UI state. */
  const speakSessionRef = useRef(0);

  const stop = useCallback(async () => {
    speakSessionRef.current += 1;
    speakBusyRef.current = false;
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
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      });
    } catch (_) {}
  }, []);

  const speak = useCallback(
    async (key: string, text: string, options?: { audioUrl?: string }) => {
      const trimmed = text.trim();
      const directUrl = options?.audioUrl?.trim();
      if (!trimmed && !directUrl) {
        if (__DEV__) console.warn('[HomePractice] listen skipped — empty script');
        return;
      }

      // Same card while playing → toggle off.
      if (activeKeyRef.current === key && speakBusyRef.current) {
        await stop();
        return;
      }

      // Ignore rapid second tap while a fetch/play is in flight.
      if (speakBusyRef.current) {
        return;
      }

      speakBusyRef.current = true;
      await stop();
      const session = ++speakSessionRef.current;
      activeKeyRef.current = key;
      setPlayingKey(key);

      const isActive = () =>
        speakSessionRef.current === session && activeKeyRef.current === key;

      const clearPlaying = () => {
        if (isActive()) {
          speakBusyRef.current = false;
          activeKeyRef.current = null;
          setPlayingKey(null);
        }
      };

      try {
        await setPlaybackAudioMode();

        const textDigest = (await hashInput(trimmed || directUrl || key)).slice(0, 16);
        const storageKey = `${key}:${textDigest}`;
        const fetchB64 = () =>
          fetchErrorSpeak(trimmed)
            .then((r) => r.audio_base64 ?? '')
            .catch((e) => {
              if (__DEV__) console.warn('[HomePractice] server TTS failed:', e);
              return '';
            });

        const playUri = async (uri: string): Promise<boolean> => {
          if (!isActive()) return false;

          let sound: Audio.Sound;
          try {
            ({ sound } = await Audio.Sound.createAsync(
              { uri },
              { shouldPlay: true, volume: 1.0 },
            ));
          } catch (e) {
            if (__DEV__) console.warn('[HomePractice] MP3 playback failed:', e);
            cachedUris.delete(storageKey);
            await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
            return false;
          }

          if (!isActive()) {
            sound.unloadAsync().catch(() => {});
            return false;
          }

          soundRef.current = sound;
          sound.setOnPlaybackStatusUpdate((status) => {
            if (!status.isLoaded) return;
            if (status.didJustFinish && isActive()) {
              clearPlaying();
              sound.unloadAsync().catch(() => {});
              soundRef.current = null;
            }
          });
          return true;
        };

        const knownUri = cachedUris.get(storageKey);
        if (knownUri && (await playUri(knownUri))) {
          return;
        }

        if (directUrl) {
          const ok = await playUri(directUrl);
          if (ok) return;
          if (__DEV__) {
            console.warn('[HomePractice] pre-baked audio failed — falling back to server TTS');
          }
        }

        if (!trimmed) {
          clearPlaying();
          return;
        }

        // Server neural TTS — pre-baked URL miss/expiry or no URL provided.
        const uri = await getOrFetchTtsFileUri(storageKey, fetchB64);
        if (!isActive()) return;
        if (!uri) {
          clearPlaying();
          return;
        }
        cachedUris.set(storageKey, uri);
        const ok = await playUri(uri);
        if (!ok) clearPlaying();
      } catch (e) {
        if (__DEV__) console.warn('[HomePractice] speak failed:', e);
        clearPlaying();
      }
    },
    [stop],
  );

  return { playingKey, speak, stop };
}
