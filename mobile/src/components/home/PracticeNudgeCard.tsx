import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../theme/useAppTheme";
import type { LearningTask } from "../../api/tasks";

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) === 1 ? "" : "s"} ago`;
  return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) === 1 ? "" : "s"} ago`;
}

function typeIcon(type: string): string {
  const t = (type || "").toLowerCase();
  if (t === "pronunciation") return "🎙️";
  if (t === "grammar") return "✏️";
  if (t === "vocabulary") return "📖";
  return "📌";
}

export interface PracticeNudgeCardProps {
  task: LearningTask;
  onPress: (task: LearningTask) => void;
}

export function PracticeNudgeCard({ task, onPress }: PracticeNudgeCardProps) {
  const theme = useAppTheme();
  const styles = getStyles(theme);

  const target = task.content?.target ?? task.title;
  const sessionDate = task.session?.createdAt;
  const subtitle = sessionDate
    ? `From your call · ${formatRelativeTime(sessionDate)}`
    : "From your call";
  const isHighSeverity = (task.content?.severity || "").toLowerCase() === "high";

  const handlePress = () => onPress(task);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.85}
      accessibilityLabel={`Practice: ${target}. ${subtitle}`}
      accessibilityRole="button"
    >
      {isHighSeverity && <View style={styles.severityDot} />}

      <View style={styles.row}>
        <View style={styles.iconContainer}>
          <Text style={styles.iconEmoji}>{typeIcon(task.type)}</Text>
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.target} numberOfLines={1}>
            {target}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View style={styles.chevron}>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
        </View>
      </View>

      <TouchableOpacity
        style={styles.ctaButton}
        onPress={handlePress}
        activeOpacity={0.9}
        accessibilityLabel="Practice Now"
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>Practice Now →</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      marginHorizontal: theme.spacing.l,
      marginBottom: theme.spacing.m,
      padding: theme.spacing.l,
      ...theme.shadows.medium,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.05)",
      position: "relative",
    },
    severityDot: {
      position: "absolute",
      top: 12,
      right: 12,
      width: 2,
      height: 2,
      borderRadius: 1,
      backgroundColor: theme.colors.error,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: theme.spacing.m,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: theme.colors.primary + "15",
      justifyContent: "center",
      alignItems: "center",
      marginRight: theme.spacing.m,
    },
    iconEmoji: {
      fontSize: 24,
    },
    textContainer: {
      flex: 1,
      minWidth: 0,
      justifyContent: "center",
    },
    target: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.colors.text.primary,
      marginBottom: 2,
    },
    subtitle: {
      fontSize: 13,
      color: theme.colors.text.secondary,
    },
    chevron: {
      marginLeft: theme.spacing.s,
      justifyContent: "center",
    },
    ctaButton: {
      width: "100%",
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: theme.colors.primary + "20",
      borderWidth: 1,
      borderColor: theme.colors.primary + "40",
      alignItems: "center",
      justifyContent: "center",
    },
    ctaText: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.colors.primary,
    },
  });
