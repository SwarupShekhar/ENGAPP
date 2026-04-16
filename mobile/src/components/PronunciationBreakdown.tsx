import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Speech from "expo-speech";
import { useAppTheme } from "../theme/useAppTheme";

export interface PhonemeDetail {
  phoneme: string;
  accuracy_score: number;
  is_correct: boolean;
  actually_said: string | null;
}

export interface WordDetail {
  word: string;
  accuracy_score: number;
  error_type: string;
  phonemes: PhonemeDetail[];
}

export interface TutorPronunciationAssessmentResult {
  words: WordDetail[];
  maya_feedback?: string;
  phonetic_insights?: any;
  recognized_text?: string;
  accuracy_score?: number;
}

// IPA → plain English descriptions for Indian learners
// Don't show raw IPA to users — they won't know what ɪ means
const PHONEME_DESCRIPTIONS: Record<string, string> = {
  ɪ: 'short "i" as in s-I-t',
  iː: 'long "ee" as in s-EE-n',
  ɛ: '"e" as in b-E-d',
  æ: 'flat "a" as in c-A-t',
  ʌ: 'short "u" as in c-U-p',
  ɑː: 'long "aa" as in f-A-ther',
  ʊ: 'short "oo" as in b-OO-k',
  uː: 'long "oo" as in f-OO-d',
  ə: 'soft "uh" as in sof-A',
  ʃ: '"sh" as in SH-oe',
  s: '"s" as in S-ee',
  w: '"w" as in W-et (round lips)',
  v: '"v" as in V-et (teeth on lip)',
  θ: '"th" as in TH-ink (tongue between teeth)',
  ð: '"th" as in TH-e (soft, voiced)',
  d: '"d" as in D-og',
  t: '"t" as in T-op',
  ŋ: '"ng" as in si-NG',
  l: '"l" as in L-eg',
  r: '"r" as in R-ed',
};

const getDescription = (phoneme: string) =>
  PHONEME_DESCRIPTIONS[phoneme] ?? `"${phoneme}"`;

// Single word with colour-coded phoneme slots
const WordBreakdown = ({ wordData }: { wordData: WordDetail }) => {
  const theme = useAppTheme();
  const [selectedPhoneme, setSelectedPhoneme] = useState<PhonemeDetail | null>(
    null,
  );

  const speakPhonemeTip = useCallback(
    (word: string, p: PhonemeDetail) => {
      Speech.stop();
      const wrong = getDescription(p.actually_said ?? "?");
      const right = getDescription(p.phoneme);
      const line = `In "${word}", it sounded like ${wrong}. Try ${right} instead.`;
      Speech.speak(line, { language: "en-US", rate: 0.92 });
    },
    [],
  );

  const hasErrors = wordData.phonemes?.some((p) => !p.is_correct);
  const coral = theme.tokens.skill.pronunciation;
  const coralTint = theme.tokens.skill.pronunciationTint;

  return (
    <View style={styles.wordContainer}>
      {/* Word label */}
      <Text
        style={[
          styles.wordLabel,
          hasErrors ? { color: coral } : { color: theme.colors.success },
        ]}
      >
        {wordData.word}
      </Text>

      {/* Phoneme slots */}
      <View style={styles.phonemeRow}>
        {wordData.phonemes?.map((p, i) => (
          <TouchableOpacity
            key={i}
            onPress={() =>
              setSelectedPhoneme(
                selectedPhoneme?.phoneme === p.phoneme && !p.is_correct
                  ? null
                  : p,
              )
            }
            style={[
              styles.phonemeSlot,
              p.is_correct
                ? styles.phonemeCorrect
                : { backgroundColor: coralTint, borderColor: coral },
              selectedPhoneme === p && styles.phonemeSelected,
            ]}
          >
            <Text style={styles.phonemeText}>{p.phoneme}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tooltip — shows when a wrong phoneme is tapped */}
      {selectedPhoneme && !selectedPhoneme.is_correct && (
        <View style={styles.tooltip}>
          <View style={styles.tooltipHeader}>
            <Text style={styles.tooltipTitle}>Sound mismatch</Text>
            <TouchableOpacity
              onPress={() => speakPhonemeTip(wordData.word, selectedPhoneme)}
              style={styles.listenBtn}
              accessibilityRole="button"
              accessibilityLabel="Listen to this tip"
            >
              <Text style={styles.listenBtnText}>Listen</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.tooltipLine}>
            ✗ You said:{" "}
            <Text style={styles.tooltipWrong}>
              {getDescription(selectedPhoneme.actually_said ?? "?")}
            </Text>
          </Text>
          <Text style={styles.tooltipLine}>
            ✓ Should be:{" "}
            <Text
              style={[styles.tooltipCorrect, { color: theme.colors.success }]}
            >
              {getDescription(selectedPhoneme.phoneme)}
            </Text>
          </Text>
        </View>
      )}
    </View>
  );
};

// Full breakdown card shown after assessment
export const PronunciationBreakdown = ({
  result,
}: {
  result: TutorPronunciationAssessmentResult;
}) => {
  if (!result.words?.length) return null;

  const problemWords = result.words.filter((w) =>
    w.phonemes?.some((p) => !p.is_correct),
  );

  if (!problemWords.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.allGoodText}>
          Sab sahi tha! No sound issues detected 🎉
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Phonetic Breakdown</Text>
      <Text style={styles.cardSubtitle}>
        Tap a red sound to see what went wrong
      </Text>
      {problemWords.map((w, i) => (
        <WordBreakdown key={i} wordData={w} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cardTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  cardSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 16,
  },
  wordContainer: {
    marginBottom: 20,
  },
  wordLabel: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  wordLabelOk: { color: "#4ade80" },
  wordLabelError: { color: "#f87171" },
  phonemeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  phonemeSlot: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  phonemeCorrect: {
    backgroundColor: "#14532d",
    borderColor: "#4ade80",
  },
  phonemeWrong: {
    backgroundColor: "#450a0a",
    borderColor: "#f87171",
  },
  phonemeSelected: {
    borderWidth: 2,
    borderColor: "#facc15",
  },
  phonemeText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "monospace",
  },
  tooltip: {
    marginTop: 8,
    backgroundColor: "#0F172A",
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#facc15",
  },
  tooltipHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  tooltipTitle: {
    color: "#facc15",
    fontSize: 12,
    fontWeight: "600",
  },
  listenBtn: {
    backgroundColor: "rgba(250, 204, 21, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  listenBtnText: {
    color: "#facc15",
    fontSize: 12,
    fontWeight: "600",
  },
  tooltipLine: {
    color: "#ccc",
    fontSize: 13,
    marginBottom: 3,
  },
  tooltipWrong: { color: "#f87171", fontWeight: "600" },
  tooltipCorrect: { color: "#4ade80", fontWeight: "600" },
  allGoodText: {
    color: "#4ade80",
    fontSize: 15,
    textAlign: "center",
  },
});
