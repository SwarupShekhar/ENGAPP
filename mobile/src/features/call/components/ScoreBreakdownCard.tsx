import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../../theme/useAppTheme";

interface ScoreBreakdownCardProps {
  scores: {
    pronunciation: number;
    grammar: number;
    vocabulary: number;
    fluency: number;
  };
  /** Treat pronunciation=50 as "processing" sentinel and show spinner */
  pronunciationProcessing?: boolean;
  justifications?: {
    pronunciation?: string;
    grammar?: string;
    vocabulary?: string;
    fluency?: string;
  };
  /** Which section is currently playing audio. null = none. */
  playingSection?: string | null;
  /** Which section is loading audio. null = none. */
  loadingSection?: string | null;
  /** Called when user taps play/pause on a section card. */
  onPlay?: (section: string) => void;
}

export const ScoreBreakdownCard: React.FC<ScoreBreakdownCardProps> = ({
  scores,
  pronunciationProcessing,
  justifications,
  playingSection,
  loadingSection,
  onPlay,
}) => {
  const theme = useAppTheme();
  const styles = getStyles(theme);

  const PronunciationRing = ({ value }: { value: number }) => {
    const size = 34;
    const stroke = 4;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, value));
    const dash = (pct / 100) * c;
    const gap = c - dash;
    const color =
      value < 50 ? "#ef4444" : value < 75 ? "#f59e0b" : "#22c55e";
    const showEllipsis = value === 50.0;
    return (
      <View style={styles.ringWrap}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={"rgba(15, 23, 42, 0.12)"}
            strokeWidth={stroke}
            fill="transparent"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="transparent"
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="round"
            rotation="-90"
            originX={size / 2}
            originY={size / 2}
          />
        </Svg>
        <View style={styles.ringLabel}>
          <Text style={[styles.ringText, { color }]}>
            {showEllipsis ? "..." : Math.round(value)}
          </Text>
        </View>
      </View>
    );
  };

  const metrics = [
    {
      key: "pronunciation",
      label: "Pronunciation",
      score: scores.pronunciation,
      justification:
        justifications?.pronunciation ||
        "Based on phoneme accuracy and clarity",
      color: theme.tokens.skill.pronunciation,
      tint: theme.tokens.skill.pronunciationTint,
    },
    {
      key: "grammar",
      label: "Grammar",
      score: scores.grammar,
      justification:
        justifications?.grammar ||
        "Based on structural accuracy and complexity",
      color: theme.tokens.skill.grammar,
      tint: theme.tokens.skill.grammarTint,
    },
    {
      key: "vocabulary",
      label: "Vocabulary",
      score: scores.vocabulary,
      justification:
        justifications?.vocabulary ||
        "Based on word variety and appropriateness",
      color: theme.tokens.skill.vocabulary,
      tint: theme.tokens.skill.vocabularyTint,
    },
    {
      key: "fluency",
      label: "Fluency",
      score: scores.fluency,
      justification:
        justifications?.fluency || "Based on pacing and natural flow",
      color: theme.tokens.skill.fluency,
      tint: theme.tokens.skill.fluencyTint,
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Score Breakdown</Text>

      {metrics.map((metric) => {
        const isPlaying = playingSection === metric.key;
        const isLoading = loadingSection === metric.key;

        return (
          <View key={metric.key}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <View style={styles.scoreContainer}>
                {metric.key === "pronunciation" ? (
                  pronunciationProcessing ? (
                    <View style={styles.processingRow}>
                      <ActivityIndicator size="small" color={metric.color} />
                      <Text style={[styles.processingText, { color: metric.color }]}>
                        Processing…
                      </Text>
                    </View>
                  ) : (
                    <PronunciationRing value={metric.score} />
                  )
                ) : (
                  <Text style={[styles.score, { color: metric.color }]}>
                    {metric.score}/100
                  </Text>
                )}
              </View>
            </View>

            {/* Progress bar */}
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${Math.min(100, Math.max(0, metric.score))}%`,
                    backgroundColor: metric.color,
                  },
                ]}
              />
            </View>

            <View
              style={[
                styles.justificationContainer,
                { backgroundColor: metric.tint },
              ]}
            >
              <View style={styles.justificationHeader}>
                <Text style={[styles.justificationLabel, { color: metric.color }]}>
                  Why this score?
                </Text>
                {onPlay && (
                  <TouchableOpacity
                    onPress={() => onPlay(metric.key)}
                    activeOpacity={0.7}
                    style={styles.playButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color={metric.color} />
                    ) : (
                      <Ionicons
                        name={isPlaying ? "pause-circle" : "play-circle-outline"}
                        size={22}
                        color={metric.color}
                      />
                    )}
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.justificationText}>
                {metric.justification ||
                  `Based on your ${metric.label.toLowerCase()} during the call. ${metric.score >= 70 ? "Keep it up." : "Focus on the tips below to improve."}`}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: "rgba(255, 255, 255, 0.85)",
      borderRadius: 16,
      padding: theme.spacing.m,
      marginBottom: theme.spacing.l,
      marginHorizontal: theme.spacing.l,
      ...theme.shadows.medium,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.6)",
    },
    title: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "bold",
      color: theme.colors.text.primary,
      marginBottom: theme.spacing.m,
    },
    metricRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 8,
    },
    metricLabel: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "500",
      color: theme.colors.text.primary,
    },
    scoreContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    processingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    processingText: {
      fontSize: theme.typography.sizes.s,
      fontWeight: "700",
    },
    ringWrap: {
      width: 34,
      height: 34,
      justifyContent: "center",
      alignItems: "center",
    },
    ringLabel: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      justifyContent: "center",
      alignItems: "center",
    },
    ringText: {
      fontSize: 11,
      fontWeight: "800",
    },
    score: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "700",
    },
    progressBarBg: {
      height: 6,
      backgroundColor: theme.colors.border,
      borderRadius: 3,
      marginBottom: 8,
      overflow: "hidden",
    },
    progressBarFill: {
      height: "100%",
      borderRadius: 3,
    },
    justificationContainer: {
      padding: 10,
      borderRadius: 8,
      marginBottom: 12,
    },
    justificationHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 2,
    },
    justificationLabel: {
      fontSize: 11,
      fontWeight: "600",
    },
    playButton: {
      width: 24,
      height: 24,
      justifyContent: "center",
      alignItems: "center",
    },
    justificationText: {
      fontSize: 12,
      color: theme.colors.text.secondary,
      lineHeight: 18,
    },
  });
