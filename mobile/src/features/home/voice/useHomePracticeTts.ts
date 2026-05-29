import { useCallback, useRef, useState } from 'react';
import * as Speech from 'expo-speech';

/** On-device TTS for phrase/word of the day (practice target only). */
export function useHomePracticeTts() {
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const activeKeyRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    Speech.stop();
    activeKeyRef.current = null;
    setPlayingKey(null);
  }, []);

  const speak = useCallback(
    (key: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (activeKeyRef.current === key) {
        stop();
        return;
      }

      Speech.stop();
      activeKeyRef.current = key;
      setPlayingKey(key);

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
