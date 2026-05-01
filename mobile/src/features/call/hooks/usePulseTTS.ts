import { useState, useCallback, useRef } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { fetchErrorSpeak } from '../../../api/tts';
import { getPronFix, PronIssueNormalized } from '../utils/pronUtils';

export function usePulseTTS() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const play = useCallback(async (issue: PronIssueNormalized, firstName?: string) => {
    const tip = getPronFix(issue.rule_category);
    const name = firstName ? `${firstName}, ` : '';
    const hasSpoken = issue.spoken && issue.spoken !== '—';
    const text = hasSpoken
      ? `${name}you said "${issue.spoken}" — say "${issue.correct}" instead. ${tip}`
      : `${name}say "${issue.correct}" clearly. ${tip}`;

    setPlayingId(issue.id);
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const result = await fetchErrorSpeak(text);
      if (result.audio_base64) {
        const tmpUri = `${FileSystem.cacheDirectory}pron_${issue.id}.mp3`;
        await FileSystem.writeAsStringAsync(tmpUri, result.audio_base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: tmpUri },
          { shouldPlay: true },
        );
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((s) => {
          if (s.isLoaded && s.didJustFinish) setPlayingId(null);
        });
      }
    } catch {
      Speech.speak(text, { onDone: () => setPlayingId(null) });
    }
  }, []);

  const stop = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      soundRef.current = null;
    }
    Speech.stop();
    setPlayingId(null);
  }, []);

  return { playingId, play, stop };
}
