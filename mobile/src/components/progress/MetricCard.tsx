import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../theme/ThemeProvider";

interface MetricCardProps {
  title: string;
  score: number;
  delta: number;
  maxScore?: number;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  score,
  delta,
  maxScore = 100,
}) => {
  const { theme } = useTheme();
  const rounded = Math.round(score);
  const roundedDelta = Math.round(delta * 10) / 10;

  const deltaColor =
    roundedDelta > 0
      ? "#10B981"
      : roundedDelta < 0
        ? "#F43F5E"
        : theme.colors.text.secondary;

  const deltaIcon = roundedDelta > 0 ? "↑" : roundedDelta < 0 ? "↓" : "→";
  const deltaText =
    roundedDelta === 0
      ? "Stable"
      : `${roundedDelta > 0 ? "+" : ""}${roundedDelta}`;

  const fillPercent = Math.min(Math.max((rounded / maxScore) * 100, 0), 100);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border + "30",
        },
      ]}
    >
      {/* Title row */}
      <Text
        style={[styles.title, { color: theme.colors.text.secondary }]}
        numberOfLines={1}
      >
        {title}
      </Text>

      {/* Score */}
      <Text style={[styles.score, { color: theme.colors.text.primary }]}>
        {rounded}
      </Text>

      {/* Delta badge */}
      <View style={[styles.deltaBadge, { backgroundColor: deltaColor + "12" }]}>
        <Text style={[styles.deltaText, { color: deltaColor }]}>
          {deltaIcon} {deltaText}
        </Text>
      </View>

      {/* Progress bar */}
      <View
        style={[
          styles.progressBar,
          { backgroundColor: theme.colors.border + "20" },
        ]}
      >
        <LinearGradient
          colors={theme.gradients.primary as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressFill, { width: `${fillPercent}%` }]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  score: {
    fontSize: 32,
    fontWeight: "900",
    marginBottom: 6,
  },
  deltaBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 12,
  },
  deltaText: {
    fontSize: 11,
    fontWeight: "700",
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
});
