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
  /** Bumps on every stop/speak so stale Speech callbacks cannot clear UI state. */
  const speakSessionRef = useRef(0);

  const stop = useCallback(async () => {
    speakSessionRef.current += 1;
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
    // Hand audio session back so the mic can record on the next tap.
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
      const session = ++speakSessionRef.current;
      activeKeyRef.current = key;
      setPlayingKey(key);

      const isActive = () =>
        speakSessionRef.current === session && activeKeyRef.current === key;

      const clearPlaying = () => {
        if (isActive()) {
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

        // Cached server MP3 from a previous tap — play immediately.
        const knownUri = cachedUris.get(storageKey);
        if (knownUri && (await playUri(knownUri))) {
          return;
        }

        // Device TTS — instant feedback; never call Speech.stop() mid-utterance (breaks onStopped).
        Speech.speak(trimmed, {
          language: 'en-US',
          rate: 0.78,
          onDone: clearPlaying,
          onError: () => {
            if (__DEV__) console.warn('[HomePractice] device TTS error');
            clearPlaying();
          },
        });

        // Prefetch server MP3 for the *next* tap only (no mid-playback swap).
        void getOrFetchTtsFileUri(storageKey, fetchB64)
          .then((uri) => {
            if (uri) cachedUris.set(storageKey, uri);
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
