import { useCallback, useRef, useState } from 'react';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
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
      if (!trimmed) {
        if (__DEV__) console.warn('[HomePractice] listen skipped — empty script');
        return;
      }

      if (activeKeyRef.current === key) {
        await stop();
        return;
      }

      await stop();
      activeKeyRef.current = key;
      setPlayingKey(key);

      const clearPlaying = () => {
        if (activeKeyRef.current === key) {
          activeKeyRef.current = null;
          setPlayingKey(null);
        }
      };

      try {
        await setPlaybackAudioMode();

        const textDigest = (await hashInput(trimmed)).slice(0, 16);
        const storageKey = `${key}:${textDigest}`;
        const fetchB64 = () =>
          fetchErrorSpeak(trimmed)
            .then((r) => r.audio_base64 ?? '')
            .catch((e) => {
              if (__DEV__) console.warn('[HomePractice] server TTS failed:', e);
              return '';
            });

        const playUri = async (uri: string): Promise<boolean> => {
          if (activeKeyRef.current !== key) return false;

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

        // Cached server MP3 from a previous tap — play immediately.
        const knownUri = cachedUris.get(storageKey);
        if (knownUri && (await playUri(knownUri))) {
          return;
        }

        // Device TTS first so every tap gets instant audio (works offline / when API fails).
        Speech.speak(trimmed, {
          language: 'en-US',
          rate: 0.78,
          onDone: clearPlaying,
          onStopped: clearPlaying,
          onError: () => {
            if (__DEV__) console.warn('[HomePractice] device TTS error');
            clearPlaying();
          },
        });

        // Upgrade to server MP3 in background when available (next tap uses cache).
        void getOrFetchTtsFileUri(storageKey, fetchB64)
          .then(async (uri) => {
            if (!uri || activeKeyRef.current !== key) return;
            cachedUris.set(storageKey, uri);
            // If device speech is still playing this turn, swap to higher-quality audio.
            const upgraded = await playUri(uri);
            if (upgraded && __DEV__) {
              console.log('[HomePractice] upgraded to server TTS');
            }
          })
          .catch(() => {});
      } catch (e) {
        if (__DEV__) console.warn('[HomePractice] speak failed:', e);
        clearPlaying();
      }
    },
    [stop],
  );

  return { playingKey, speak, stop };
}
