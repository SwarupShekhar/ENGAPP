import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from "react-native-reanimated";
import { useAppTheme } from "../../theme/useAppTheme";

interface Props {
  currentScore: number;
  goalTarget: number;
  goalLabel: string;
}

export default function NextGoalIndicator({
  currentScore,
  goalTarget,
  goalLabel,
}: Props) {
  const { theme } = useAppTheme();
  const width = useSharedValue(0);

  useEffect(() => {
    const percentage = Math.min((currentScore / goalTarget) * 100, 100);
    width.value = withDelay(
      400,
      withSpring(percentage, {
        damping: 15,
        stiffness: 80,
      }),
    );
  }, [currentScore, goalTarget]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  const pointsToGo = Math.max(goalTarget - currentScore, 0);
  const accentColor = theme.gradients.premium[0];

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: theme.colors.text.primary }]}>
          {goalLabel}
        </Text>
        <Text
          style={[styles.pointsText, { color: theme.colors.text.secondary }]}
        >
          {pointsToGo > 0 ? `${pointsToGo} points to go` : "Achieved! 🎉"}
        </Text>
      </View>

      <View
        style={[
          styles.trackContainer,
          { backgroundColor: theme.colors.border + "40" },
        ]}
      >
        <Animated.View
          style={[
            styles.progressFill,
            { backgroundColor: accentColor },
            animatedStyle,
          ]}
        />

        {/* Milestone marker */}
        <Animated.View
          style={[
            styles.milestoneMarker,
            { left: `${Math.min((currentScore / goalTarget) * 100, 100)}%` },
          ]}
        >
          <View
            style={[
              styles.markerDot,
              {
                backgroundColor: accentColor,
                borderColor: theme.colors.surface,
                shadowColor: accentColor,
              },
            ]}
          />
        </Animated.View>
      </View>

      <View style={styles.scoreRange}>
        <Text style={[styles.currentScore, { color: accentColor }]}>
          {currentScore}
        </Text>
        <Text style={[styles.targetScore, { color: theme.colors.text.light }]}>
          {goalTarget}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  pointsText: {
    fontSize: 13,
    fontWeight: "500",
  },
  trackContainer: {
    position: "relative",
    height: 6,
    borderRadius: 3,
    overflow: "visible",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  milestoneMarker: {
    position: "absolute",
    top: -3,
    transform: [{ translateX: -6 }],
  },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  scoreRange: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  currentScore: {
    fontSize: 12,
    fontWeight: "600",
  },
  targetScore: {
    fontSize: 12,
    fontWeight: "500",
  },
});
