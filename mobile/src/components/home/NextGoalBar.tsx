import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

interface Props {
  currentScore: number;
  goalTarget: number;
  goalLabel: string; // e.g., "Reach B2"
}

export default function NextGoalBar({
  currentScore,
  goalTarget,
  goalLabel,
}: Props) {
  const width = useSharedValue(0);

  useEffect(() => {
    const percentage = Math.min((currentScore / goalTarget) * 100, 100);
    width.value = withSpring(percentage, {
      damping: 14,
      stiffness: 120,
    });
  }, [currentScore, goalTarget]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  const pointsToGo = Math.max(goalTarget - currentScore, 0);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{goalLabel}</Text>
        <Text style={styles.pointsText}>
          {pointsToGo > 0 ? `${pointsToGo} to go` : "Goal reached! 🎉"}
        </Text>
      </View>

      <View style={styles.barContainer}>
        <Animated.View style={[styles.barFill, animatedStyle]} />
      </View>

      <Text style={styles.scoreRange}>
        {currentScore} / {goalTarget}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    width: "100%",
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "white",
  },
  pointsText: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.8)",
    fontWeight: "600",
  },
  barContainer: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: "#10B981", // theme success color or bright color
    borderRadius: 3,
  },
  scoreRange: {
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.6)",
    marginTop: 4,
    textAlign: "right",
    fontWeight: "600",
  },
});
