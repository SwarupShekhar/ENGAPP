import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Speech from 'expo-speech';

export type FlaggedPronunciation = {
  spoken: string;
  correct: string;
  rule_category: string;
  reel_id: string;
  confidence: number;
};

type Props = {
  transcript: string;
  flagged: FlaggedPronunciation[];
  onReelPress?: (reelId: string, ruleCategory: string) => void;
};

/**
 * Renders transcript with pronunciation errors inline:
 * spoken → red strikethrough, correct → green + play (TTS) + tap → reel.
 */
export function PronunciationTranscriptHighlight({
  transcript,
  flagged,
  onReelPress,
}: Props) {
  const playCorrect = useCallback((word: string) => {
    Speech.stop();
    Speech.speak(word, { language: 'en-US', rate: 0.9 });
  }, []);

  if (!transcript?.trim() || !flagged?.length) {
    return <Text style={styles.body}>{transcript || ''}</Text>;
  }

  // Build segments: split transcript by flagged spoken words (first occurrence each), render pair inline
  const lowerTranscript = transcript.toLowerCase();
  const segments: Array<{ type: 'text' | 'error'; text?: string; error?: FlaggedPronunciation }> = [];
  let cursor = 0;
  const used = new Set<string>();

  for (const err of flagged) {
    const spokenLower = (err.spoken || '').toLowerCase().trim();
    if (!spokenLower || used.has(spokenLower)) continue;
    const idx = lowerTranscript.indexOf(spokenLower, cursor);
    if (idx === -1) continue;
    used.add(spokenLower);
    if (idx > cursor) {
      segments.push({ type: 'text', text: transcript.slice(cursor, idx) });
    }
    segments.push({ type: 'error', error: err });
    cursor = idx + spokenLower.length;
  }
  if (cursor < transcript.length) {
    segments.push({ type: 'text', text: transcript.slice(cursor) });
  }

  if (segments.length === 0) {
    return <Text style={styles.body}>{transcript}</Text>;
  }

  return (
    <View style={styles.wrap}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return (
            <Text key={i} style={styles.body}>
              {seg.text}
            </Text>
          );
        }
        const err = seg.error!;
        return (
          <View key={i} style={styles.inlineRow}>
            <Text style={styles.spokenStrike}>{err.spoken}</Text>
            <Text style={styles.arrow}> → </Text>
            <Pressable
              style={styles.correctWrap}
              onPress={() => onReelPress?.(err.reel_id, err.rule_category)}
              hitSlop={8}
            >
              <Text style={styles.correctText}>{err.correct}</Text>
            </Pressable>
            <Pressable
              style={styles.playBtn}
              onPress={() => playCorrect(err.correct)}
              hitSlop={8}
            >
              <Text style={styles.playIcon}>▶</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  body: { fontSize: 16, lineHeight: 24, color: '#111' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginRight: 4, marginBottom: 4 },
  spokenStrike: { fontSize: 16, color: '#c00', textDecorationLine: 'line-through' },
  arrow: { fontSize: 14, color: '#666' },
  correctWrap: { backgroundColor: '#e8f5e9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  correctText: { fontSize: 16, color: '#1b5e20', fontWeight: '600' },
  playBtn: { marginLeft: 4, padding: 4 },
  playIcon: { fontSize: 12, color: '#2e7d32' },
});
