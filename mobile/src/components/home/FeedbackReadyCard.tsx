import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useAppTheme } from "../../theme/useAppTheme";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

interface FeedbackReadyCardProps {
  onPress: () => void;
  timeAgo?: string;
  overallScore?: number;
  grammarDelta?: number;
  fluencyDelta?: number;
  vocabDelta?: number;
  pronunciationDelta?: number;
}

function DeltaChip({ label, delta }: { label: string; delta?: number }) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  if (delta === undefined || delta === 0) return null;
  const isUp = delta > 0;
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: isUp
            ? theme.colors.success + "15"
            : theme.colors.error + "15",
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: isUp ? theme.colors.success : theme.colors.error },
        ]}
      >
        {isUp ? "↑" : "↓"} {label}
      </Text>
    </View>
  );
}

export function FeedbackReadyCard({
  onPress,
  timeAgo = "2 min ago",
  overallScore,
  grammarDelta,
  fluencyDelta,
  vocabDelta,
  pronunciationDelta,
}: FeedbackReadyCardProps) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const isDeep = theme.variation === "deep";
  const hasScore = overallScore !== undefined && overallScore > 0;
  const hasDelta =
    grammarDelta || fluencyDelta || vocabDelta || pronunciationDelta;

  return (
    <TouchableOpacity
      style={[styles.cardContainer, theme.shadows.medium]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <BlurView
        intensity={isDeep ? 40 : 60}
        tint={isDeep ? "dark" : "light"}
        style={styles.cardBlur}
      >
        <View
          style={[
            styles.cardContent,
            { backgroundColor: theme.colors.surface + (isDeep ? "60" : "A0") },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.iconBg}>
                <Ionicons name="sparkles" size={14} color="white" />
              </View>
              <Text style={styles.title}>Latest Feedback</Text>
            </View>
            <Text style={styles.time}>{timeAgo}</Text>
          </View>

          {hasScore ? (
            <View style={styles.scoreRow}>
              <View style={styles.scoreCircle}>
                <Text style={styles.scoreValue}>{overallScore}</Text>
              </View>
              <View style={styles.scoreDetails}>
                <Text style={styles.scoreLabel}>Overall Score</Text>
                <Text style={styles.scoreHint}>
                  {overallScore >= 80
                    ? "Excellent work! 🎉"
                    : overallScore >= 60
                      ? "Good progress! 💪"
                      : "Keep practicing! 🚀"}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.description}>
              Complete a call to see your feedback here!
            </Text>
          )}

          {hasDelta && (
            <View style={styles.chipsRow}>
              <DeltaChip label="Grammar" delta={grammarDelta} />
              <DeltaChip label="Fluency" delta={fluencyDelta} />
              <DeltaChip label="Vocab" delta={vocabDelta} />
              <DeltaChip label="Pronun." delta={pronunciationDelta} />
            </View>
          )}

          <View style={styles.footer}>
            <Text style={styles.detailsText}>View Details</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={theme.colors.primary}
            />
          </View>
        </View>
      </BlurView>
    </TouchableOpacity>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    cardContainer: {
      borderRadius: 20,
      marginHorizontal: theme.spacing.l,
      marginBottom: theme.spacing.l,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
    cardBlur: {
      width: "100%",
    },
    cardContent: {
      padding: theme.spacing.l,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    iconBg: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.colors.primary,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
      elevation: 4,
    },
    title: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    time: {
      fontSize: 13,
      color: theme.colors.text.secondary,
      fontWeight: "500",
    },
    scoreRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
      backgroundColor: theme.colors.primary + "0A",
      padding: 12,
      borderRadius: 16,
    },
    scoreCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: theme.colors.primary + "1A",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
      borderWidth: 1,
      borderColor: theme.colors.primary + "30",
    },
    scoreValue: {
      fontSize: 22,
      fontWeight: "800",
      color: theme.colors.primary,
    },
    scoreDetails: {
      flex: 1,
    },
    scoreLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.text.primary,
      marginBottom: 2,
    },
    scoreHint: {
      fontSize: 13,
      color: theme.colors.text.secondary,
      fontWeight: "500",
    },
    description: {
      fontSize: 14,
      color: theme.colors.text.secondary,
      marginBottom: 16,
      lineHeight: 20,
    },
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16,
    },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
    },
    chipText: {
      fontSize: 12,
      fontWeight: "700",
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 4,
      borderTopWidth: 1,
      borderTopColor: "rgba(0,0,0,0.05)",
      paddingTop: 12,
    },
    detailsText: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.primary,
    },
  });
