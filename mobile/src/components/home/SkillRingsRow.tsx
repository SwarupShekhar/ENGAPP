import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../theme/useAppTheme";

interface SkillBarProps {
  label: string;
  score: number;
  delta?: number;
  isMastered?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  gradientColors: readonly [string, string, ...string[]];
  bgColor: string;
}

function SkillBar({
  label,
  score,
  delta,
  isMastered,
  icon,
  gradientColors,
  bgColor,
}: SkillBarProps) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const clampedScore = Math.min(Math.max(score, 0), 100);

  return (
    <View style={styles.skillItem}>
      <View style={styles.skillHeader}>
        <View style={[styles.skillIcon, { backgroundColor: bgColor }]}>
          <Ionicons name={icon} size={14} color={gradientColors[0]} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.skillLabel}>{label}</Text>
            {isMastered && (
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={theme.colors.success}
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
          {delta !== undefined && delta !== 0 && (
            <Text
              style={[
                styles.deltaText,
                {
                  color: delta > 0 ? theme.colors.success : theme.colors.error,
                },
              ]}
            >
              {delta > 0 ? "+" : ""}
              {delta} {delta > 0 ? "↑" : "↓"}
            </Text>
          )}
        </View>
        <Text style={[styles.skillScore, { color: gradientColors[0] }]}>
          {clampedScore}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.barFill, { width: `${Math.max(clampedScore, 3)}%` }]}
        />
      </View>
    </View>
  );
}

interface SkillRingsRowProps {
  grammar: number;
  pronunciation: number;
  fluency: number;
  vocabulary: number;
  deltas?: Record<string, number>;
  masteryFlags?: Record<string, boolean> | null;
  deltaLabel?: string;
}

export function SkillRingsRow({
  grammar,
  pronunciation,
  fluency,
  vocabulary,
  deltas,
  masteryFlags,
  deltaLabel,
}: SkillRingsRowProps) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const avgScore = Math.round(
    (grammar + pronunciation + fluency + vocabulary) / 4,
  );

  return (
    <View style={styles.container}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionTitle}>Your Skills</Text>
          {deltaLabel && <Text style={styles.deltaLabel}>{deltaLabel}</Text>}
        </View>
        <View style={styles.avgBadge}>
          <Text style={styles.avgText}>Avg: {avgScore}</Text>
        </View>
      </View>

      {/* Skill bars */}
      <SkillBar
        label="Grammar"
        score={grammar}
        delta={deltas?.grammar}
        isMastered={masteryFlags?.grammar}
        icon="text"
        gradientColors={theme.colors.gradients.primary}
        bgColor={theme.colors.primary + "15"}
      />
      <SkillBar
        label="Pronunciation"
        score={pronunciation}
        delta={deltas?.pronunciation}
        isMastered={masteryFlags?.pronunciation}
        icon="mic"
        gradientColors={[theme.colors.warning, theme.colors.warning + "dd"]}
        bgColor={theme.colors.warning + "15"}
      />
      <SkillBar
        label="Fluency"
        score={fluency}
        delta={deltas?.fluency}
        isMastered={masteryFlags?.fluency}
        icon="water"
        gradientColors={[theme.colors.success, theme.colors.success + "dd"]}
        bgColor={theme.colors.success + "15"}
      />
      <SkillBar
        label="Vocabulary"
        score={vocabulary}
        delta={deltas?.vocabulary}
        isMastered={masteryFlags?.vocabulary}
        icon="book"
        gradientColors={[
          theme.colors.text.accent,
          theme.colors.text.accent + "dd",
        ]}
        bgColor={theme.colors.text.accent + "15"}
      />
    </View>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      marginHorizontal: theme.spacing.l,
      marginBottom: theme.spacing.l,
      backgroundColor: "rgba(255, 255, 255, 0.85)",
      borderRadius: 20,
      padding: theme.spacing.l,
      // Glassmorphism effect
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.6)",
      ...theme.shadows.medium,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    deltaLabel: {
      fontSize: 11,
      color: theme.colors.text.secondary,
      marginTop: 2,
    },
    avgBadge: {
      backgroundColor: theme.colors.primary + "15",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
    },
    avgText: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.colors.primary,
    },
    skillItem: {
      marginBottom: 14,
    },
    skillHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
    },
    skillIcon: {
      width: 24,
      height: 24,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 8,
    },
    skillLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.colors.text.primary,
    },
    deltaText: {
      fontSize: 10,
      fontWeight: "700",
      marginTop: 1,
    },
    skillScore: {
      fontSize: 15,
      fontWeight: "800",
    },
    barTrack: {
      height: 8,
      backgroundColor: theme.colors.border,
      borderRadius: 4,
      overflow: "hidden",
    },
    barFill: {
      height: "100%",
      borderRadius: 4,
    },
  });
