import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useAppTheme } from "../../theme/useAppTheme";

interface ScoreBreakdownCardProps {
  scores: {
    pronunciation: number;
    grammar: number;
    vocabulary: number;
    fluency: number;
  };
  justifications?: {
    pronunciation?: string;
    grammar?: string;
    vocabulary?: string;
    fluency?: string;
  };
}

export const ScoreBreakdownCard: React.FC<ScoreBreakdownCardProps> = ({
  scores,
  justifications,
}) => {
  const theme = useAppTheme();
  const styles = getStyles(theme);

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

      {metrics.map((metric) => (
        <View key={metric.key}>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <View style={styles.scoreContainer}>
              <Text style={[styles.score, { color: metric.color }]}>
                {metric.score}/100
              </Text>
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
            <Text style={[styles.justificationLabel, { color: metric.color }]}>
              Why this score?
            </Text>
            <Text style={styles.justificationText}>
              {metric.justification ||
                `Based on your ${metric.label.toLowerCase()} during the call. ${metric.score >= 70 ? "Keep it up." : "Focus on the tips below to improve."}`}
            </Text>
          </View>
        </View>
      ))}
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
    justificationLabel: {
      fontSize: 11,
      fontWeight: "600",
      marginBottom: 2,
    },
    justificationText: {
      fontSize: 12,
      color: theme.colors.text.secondary,
      lineHeight: 18,
    },
  });
