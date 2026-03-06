import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../theme/useAppTheme";
import { BlurView } from "expo-blur";

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
  const isDeep = theme.variation === "deep";
  const avgScore = Math.round(
    (grammar + pronunciation + fluency + vocabulary) / 4,
  );

  return (
    <View style={[styles.containerOuter, theme.shadows.medium]}>
      <BlurView
        intensity={isDeep ? 40 : 60}
        tint={isDeep ? "dark" : "light"}
        style={styles.blurContainer}
      >
        <View
          style={[
            styles.cardContent,
            { backgroundColor: theme.colors.surface + (isDeep ? "60" : "A0") },
          ]}
        >
          {/* Header row */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.sectionTitle}>Your Skills</Text>
              {deltaLabel && (
                <Text style={styles.deltaLabel}>{deltaLabel}</Text>
              )}
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
            gradientColors={[
              theme.colors.skill.grammar,
              theme.colors.skill.grammar + "dd",
            ]}
            bgColor={theme.colors.skill.grammar + "15"}
          />
          <SkillBar
            label="Pronunciation"
            score={pronunciation}
            delta={deltas?.pronunciation}
            isMastered={masteryFlags?.pronunciation}
            icon="mic"
            gradientColors={[
              theme.colors.skill.pronunciation,
              theme.colors.skill.pronunciation + "dd",
            ]}
            bgColor={theme.colors.skill.pronunciation + "15"}
          />
          <SkillBar
            label="Fluency"
            score={fluency}
            delta={deltas?.fluency}
            isMastered={masteryFlags?.fluency}
            icon="water"
            gradientColors={[
              theme.colors.skill.fluency,
              theme.colors.skill.fluency + "dd",
            ]}
            bgColor={theme.colors.skill.fluency + "15"}
          />
          <SkillBar
            label="Vocabulary"
            score={vocabulary}
            delta={deltas?.vocabulary}
            isMastered={masteryFlags?.vocabulary}
            icon="book"
            gradientColors={[
              theme.colors.skill.vocabulary,
              theme.colors.skill.vocabulary + "dd",
            ]}
            bgColor={theme.colors.skill.vocabulary + "15"}
          />
        </View>
      </BlurView>
    </View>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    containerOuter: {
      marginHorizontal: theme.spacing.l,
      marginBottom: theme.spacing.l,
      borderRadius: 20,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
    blurContainer: {
      width: "100%",
    },
    cardContent: {
      padding: theme.spacing.l,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    deltaLabel: {
      fontSize: 12,
      color: theme.colors.text.secondary,
      marginTop: 2,
    },
    avgBadge: {
      backgroundColor: theme.colors.primary + "15",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.primary + "30",
    },
    avgText: {
      fontSize: 13,
      fontWeight: "800",
      color: theme.colors.primary,
    },
    skillItem: {
      marginBottom: 16,
    },
    skillHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    skillIcon: {
      width: 28,
      height: 28,
      borderRadius: 10,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 10,
    },
    skillLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.colors.text.primary,
    },
    deltaText: {
      fontSize: 11,
      fontWeight: "700",
      marginTop: 2,
    },
    skillScore: {
      fontSize: 16,
      fontWeight: "800",
    },
    barTrack: {
      height: 6,
      backgroundColor: theme.colors.border,
      borderRadius: 3,
      overflow: "hidden",
    },
    barFill: {
      height: "100%",
      borderRadius: 3,
    },
  });
