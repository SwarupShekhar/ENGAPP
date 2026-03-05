import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { GradientCard } from "../common/GradientCard";
import { useAppTheme } from "../../theme/useAppTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { baseTheme } from "../../theme/base";

interface StatsOverviewProps {
  feedbackScore: number;
  fluencyScore: number;
  vocabScore: number;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({
  feedbackScore,
  fluencyScore,
  vocabScore,
}) => {
  const theme = useAppTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.header, { color: theme.colors.text.primary }]}>
        Your Progress
      </Text>
      <View style={styles.row}>
        <GradientCard
          style={[styles.mainCard, theme.shadows.primaryGlow]}
          colors={theme.colors.gradients.primary}
        >
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons
              name="trophy-outline"
              size={24}
              color={theme.colors.surface}
            />
          </View>
          <Text style={[styles.scoreLarge, { color: theme.colors.surface }]}>
            {feedbackScore}
          </Text>
          <Text style={[styles.labelLight, { color: theme.colors.surface }]}>
            Overall Score
          </Text>
        </GradientCard>

        <View style={styles.rightColumn}>
          <GradientCard style={styles.smallCard}>
            <Text style={[styles.scoreSmall, { color: theme.colors.primary }]}>
              {fluencyScore}%
            </Text>
            <Text
              style={[styles.labelDark, { color: theme.colors.text.secondary }]}
            >
              Fluency
            </Text>
          </GradientCard>
          <GradientCard style={styles.smallCard}>
            <Text style={[styles.scoreSmall, { color: theme.colors.primary }]}>
              {vocabScore}
            </Text>
            <Text
              style={[styles.labelDark, { color: theme.colors.text.secondary }]}
            >
              Vocab
            </Text>
          </GradientCard>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: baseTheme.spacing.m,
  },
  header: {
    fontSize: baseTheme.typography.sizes.l,
    fontWeight: baseTheme.typography.weights.bold as any,
    marginBottom: baseTheme.spacing.s,
    paddingHorizontal: baseTheme.spacing.m,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: baseTheme.spacing.m,
    gap: baseTheme.spacing.m,
  },
  mainCard: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 120,
  },
  rightColumn: {
    flex: 1,
    gap: baseTheme.spacing.m,
  },
  smallCard: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: baseTheme.spacing.s,
  },
  iconContainer: {
    marginBottom: baseTheme.spacing.xs,
    opacity: 0.9,
  },
  scoreLarge: {
    fontSize: baseTheme.typography.sizes.xxl,
    fontWeight: baseTheme.typography.weights.black as any,
  },
  labelLight: {
    fontSize: baseTheme.typography.sizes.s,
    opacity: 0.8,
  },
  scoreSmall: {
    fontSize: baseTheme.typography.sizes.l,
    fontWeight: baseTheme.typography.weights.bold as any,
  },
  labelDark: {
    fontSize: baseTheme.typography.sizes.s,
  },
});
