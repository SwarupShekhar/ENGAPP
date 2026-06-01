import { useCallback, useRef, useState } from 'react';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { fetchErrorSpeak } from '../../../api/tts';

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

/** Server TTS (Inworld via Nest) with device-speech fallback for phrase/word cards. */
export function useHomePracticeTts() {
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const stop = useCallback(async () => {
    Speech.stop();
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (_) {
        /* already stopped */
      }
      soundRef.current = null;
    }
    activeKeyRef.current = null;
    setPlayingKey(null);
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

      try {
        const result = await fetchErrorSpeak(trimmed);
        if (result.audio_base64 && activeKeyRef.current === key) {
          const tmpUri = `${FileSystem.cacheDirectory}home_practice_${key.replace(/[^a-z0-9]/gi, '_')}.mp3`;
          await FileSystem.writeAsStringAsync(tmpUri, result.audio_base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const { sound } = await Audio.Sound.createAsync(
            { uri: tmpUri },
            { shouldPlay: true, volume: 1.0 },
          );
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
          return;
        }
      } catch (e) {
        if (__DEV__) console.warn('[HomePractice] server TTS failed, fallback to device:', e);
      }

      if (activeKeyRef.current !== key) return;

      Speech.speak(trimmed, {
        language: 'en-US',
        rate: 0.9,
        onDone: () => {
          if (activeKeyRef.current === key) {
            activeKeyRef.current = null;
            setPlayingKey(null);
          }
        },
        onStopped: () => {
          if (activeKeyRef.current === key) {
            activeKeyRef.current = null;
            setPlayingKey(null);
          }
        },
        onError: () => {
          if (activeKeyRef.current === key) {
            activeKeyRef.current = null;
            setPlayingKey(null);
          }
        },
      });
    },
    [stop],
  );

  return { playingKey, speak, stop };
}
