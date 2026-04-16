import React, { useCallback, useMemo } from 'react';
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

type Segment =
  | { type: 'text'; text: string }
  | { type: 'error'; error: FlaggedPronunciation };

function coachingLine(err: FlaggedPronunciation): string {
  const spoken = (err.spoken || '').trim() || 'that';
  const correct = (err.correct || '').trim() || 'the right word';
  return `You said ${spoken}, but you should say ${correct}.`;
}

function buildTranscriptSegments(
  transcript: string,
  flagged: FlaggedPronunciation[],
): { segments: Segment[]; inlineErrors: FlaggedPronunciation[] } {
  const segments: Segment[] = [];
  const inlineErrors: FlaggedPronunciation[] = [];
  const lowerTranscript = transcript.toLowerCase();
  let cursor = 0;
  const used = new Set<string>();

  for (const err of flagged) {
    const spokenLower = (err.spoken || '').toLowerCase().trim();
    if (!spokenLower || used.has(spokenLower)) continue;
    const idx = lowerTranscript.indexOf(spokenLower, cursor);
    if (idx === -1) continue;
    used.add(spokenLower);
    inlineErrors.push(err);
    if (idx > cursor) {
      segments.push({ type: 'text', text: transcript.slice(cursor, idx) });
    }
    segments.push({ type: 'error', error: err });
    cursor = idx + spokenLower.length;
  }
  if (cursor < transcript.length) {
    segments.push({ type: 'text', text: transcript.slice(cursor) });
  }
  return { segments, inlineErrors };
}

/**
 * Renders transcript with pronunciation errors inline:
 * spoken → red strikethrough, correct → green; ▶ speaks a full coaching line
 * ("You said X, but you should say Y") + tap correct → reel.
 */
export function PronunciationTranscriptHighlight({
  transcript,
  flagged,
  onReelPress,
}: Props) {
  const { segments, inlineErrors } = useMemo(
    () =>
      transcript?.trim() && flagged?.length
        ? buildTranscriptSegments(transcript, flagged)
        : { segments: [] as Segment[], inlineErrors: [] as FlaggedPronunciation[] },
    [transcript, flagged],
  );

  /** Full coaching line so learners can listen instead of only reading the fix. */
  const speakWordFeedback = useCallback((err: FlaggedPronunciation) => {
    Speech.stop();
    Speech.speak(coachingLine(err), { language: 'en-US', rate: 0.92, pitch: 1.0 });
  }, []);

  /** expo-speech queues multiple speak() calls in order. */
  const speakAllMistakes = useCallback(() => {
    if (inlineErrors.length === 0) return;
    Speech.stop();
    if (inlineErrors.length > 1) {
      Speech.speak(`Here are ${inlineErrors.length} pronunciation tips.`, {
        language: 'en-US',
        rate: 0.92,
      });
    }
    for (const err of inlineErrors) {
      Speech.speak(coachingLine(err), { language: 'en-US', rate: 0.92, pitch: 1.0 });
    }
  }, [inlineErrors]);

  if (!transcript?.trim() || !flagged?.length) {
    return <Text style={styles.body}>{transcript || ''}</Text>;
  }

  if (segments.length === 0) {
    return <Text style={styles.body}>{transcript}</Text>;
  }

  return (
    <View style={styles.column}>
      {inlineErrors.length > 0 && (
        <Pressable
          style={styles.playAllRow}
          onPress={speakAllMistakes}
          accessibilityRole="button"
          accessibilityLabel={
            inlineErrors.length === 1
              ? 'Play pronunciation tip'
              : `Play all ${inlineErrors.length} pronunciation tips`
          }
        >
          <Text style={styles.playAllIcon}>▶</Text>
          <Text style={styles.playAllText}>
            {inlineErrors.length === 1 ? 'Play tip' : `Play all ${inlineErrors.length} tips`}
          </Text>
        </Pressable>
      )}
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
              onPress={() => speakWordFeedback(err)}
              accessibilityRole="button"
              accessibilityLabel={`Hear feedback: you said ${err.spoken}, say ${err.correct} instead`}
              hitSlop={8}
            >
              <Text style={styles.playIcon}>▶</Text>
            </Pressable>
          </View>
        );
      })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%' },
  playAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    gap: 8,
  },
  playAllIcon: { fontSize: 14, color: '#1565C0' },
  playAllText: { fontSize: 14, fontWeight: '600', color: '#1565C0' },
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
