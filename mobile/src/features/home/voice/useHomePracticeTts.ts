import { useCallback, useRef, useState } from 'react';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { fetchErrorSpeak } from '../../../api/tts';
import { getOrFetchTtsFileUri } from '../../../utils/ttsAudioCache';

// Module-level: confirmed-present URIs this session — skips getInfoAsync on repeat taps (Bug 6)
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

  // Bug 3 fix: sync state clears happen before any await, so fire-and-forget callers
  // (useFocusEffect cleanup) see cancelled state immediately without needing to await.
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

      // playUri: loads and plays uri. Guards cancellation before AND after createAsync (Bug 1).
      // Throws if createAsync fails so caller can evict corrupt cache and re-fetch (Bug 2).
      const playUri = async (uri: string): Promise<void> => {
        if (activeKeyRef.current !== key) return;

        let sound: Audio.Sound;
        try {
          ({ sound } = await Audio.Sound.createAsync(
            { uri },
            { shouldPlay: true, volume: 1.0 },
          ));
        } catch (err) {
            // Corrupt/invalid file — evict from both caches so caller can re-fetch (Bug 2)
          cachedUris.delete(storageKey);
          await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
          throw err;
        }

        // Re-check after await — stop() may have fired during createAsync (Bug 1)
        if (activeKeyRef.current !== key) {
          sound.unloadAsync().catch(() => {});
          return;
        }

        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish && activeKeyRef.current === key) {
            activeKeyRef.current = null;
            setPlayingKey(null);
            sound.unloadAsync().catch(() => {});
            soundRef.current = null;
          }
        });
      };

      const fetchB64 = () => fetchErrorSpeak(trimmed).then((r) => r.audio_base64 ?? '');
      // Key disk + memory cache by spoken text so stale phrase-of-day audio cannot replay after home refresh.
      const textDigest = (await hashInput(trimmed)).slice(0, 16);
      const storageKey = `${key}:${textDigest}`;

      try {
        // Bug 6: use in-memory map to skip getInfoAsync on repeat taps
        let uri = cachedUris.get(storageKey) ?? null;

        if (!uri) {
          // Bug 4: use shared utility instead of bespoke getInfoAsync→fetch→write
          uri = await getOrFetchTtsFileUri(storageKey, fetchB64);
          if (uri) cachedUris.set(storageKey, uri);
        }

        if (uri && activeKeyRef.current === key) {
          try {
            await playUri(uri);
            return;
          } catch {
            // playUri already evicted from cachedUris + deleted corrupt file (Bug 2).
            // One re-fetch attempt with a fresh file.
            if (activeKeyRef.current === key) {
              const freshUri = await getOrFetchTtsFileUri(storageKey, fetchB64);
              if (freshUri && activeKeyRef.current === key) {
                cachedUris.set(storageKey, freshUri);
                await playUri(freshUri);
                return;
              }
            }
          }
        }
      } catch (e) {
        if (__DEV__) console.warn('[HomePractice] server TTS failed, fallback to device:', e);
      }

      if (activeKeyRef.current !== key) return;

      Speech.speak(trimmed, {
        language: 'en-US',
        rate: 0.78,
        onDone: () => {
          if (activeKeyRef.current === key) { activeKeyRef.current = null; setPlayingKey(null); }
        },
        onStopped: () => {
          if (activeKeyRef.current === key) { activeKeyRef.current = null; setPlayingKey(null); }
        },
        onError: () => {
          if (activeKeyRef.current === key) { activeKeyRef.current = null; setPlayingKey(null); }
        },
      });
    },
    [stop],
  );

  return { playingKey, speak, stop };
}
