import { useState, useCallback, useRef } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { fetchErrorSpeak } from '../../../api/tts';
import {
  buildPronCoachingLine,
  PronIssueNormalized,
  slowCorrectWord,
} from '../utils/pronUtils';

const SLOW_WORD_RATE = 0.42;

/**
 * Issue-list speaker: coaching line, then slow correct word (stitched playlist).
 * No pattern tip (tip only on segment intro).
 */
export function usePulseTTS() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const cancelledRef = useRef(false);

  const stop = useCallback(async () => {
    cancelledRef.current = true;
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    Speech.stop();
    setPlayingId(null);
  }, []);

  const playUri = useCallback(async (uri: string): Promise<void> => {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true },
    );
    soundRef.current = sound;
    await new Promise<void>((resolve) => {
      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          if (soundRef.current === sound) soundRef.current = null;
          resolve();
        }
      });
    });
  }, []);

  const playBase64 = useCallback(
    async (b64: string, cacheName: string): Promise<boolean> => {
      if (!b64) return false;
      const tmpUri = `${FileSystem.cacheDirectory}${cacheName}.mp3`;
      await FileSystem.writeAsStringAsync(tmpUri, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await playUri(tmpUri);
      return true;
    },
    [playUri],
  );

  const play = useCallback(
    async (issue: PronIssueNormalized, firstName?: string) => {
      cancelledRef.current = false;
      const line = buildPronCoachingLine({
        spoken: issue.spoken,
        correct: issue.correct,
        ruleCategory: issue.rule_category,
        firstName,
        includeTip: false,
      });
      const slowWord = slowCorrectWord(issue.correct);

      setPlayingId(issue.id);
      try {
        if (soundRef.current) {
          await soundRef.current.stopAsync().catch(() => {});
          await soundRef.current.unloadAsync().catch(() => {});
          soundRef.current = null;
        }

        const coaching = await fetchErrorSpeak(line);
        if (cancelledRef.current) return;
        const coached = await playBase64(
          coaching.audio_base64 ?? '',
          `pron_coach_${issue.id}`,
        );
        if (!coached) {
          Speech.speak(line, {
            onDone: () => {
              if (!cancelledRef.current && slowWord) {
                Speech.speak(slowWord, {
                  rate: 0.7,
                  onDone: () => setPlayingId(null),
                });
              } else {
                setPlayingId(null);
              }
            },
          });
          return;
        }

        if (cancelledRef.current || !slowWord) {
          setPlayingId(null);
          return;
        }

        const slow = await fetchErrorSpeak(slowWord, {
          speakingRate: SLOW_WORD_RATE,
        });
        if (cancelledRef.current) return;
        const playedSlow = await playBase64(
          slow.audio_base64 ?? '',
          `pron_slow_${issue.id}`,
        );
        if (!playedSlow && !cancelledRef.current) {
          Speech.speak(slowWord, { rate: 0.7, onDone: () => setPlayingId(null) });
          return;
        }
        if (!cancelledRef.current) setPlayingId(null);
      } catch {
        if (!cancelledRef.current) {
          Speech.speak(line, {
            onDone: () => {
              if (slowWord) {
                Speech.speak(slowWord, {
                  rate: 0.7,
                  onDone: () => setPlayingId(null),
                });
              } else {
                setPlayingId(null);
              }
            },
          });
        }
      }
    },
    [playBase64],
  );

  return { playingId, play, stop };
}
