import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../../theme/ThemeProvider";

interface ProgressRingProps {
  score: number;
  cefrLevel: string;
  size?: number;
  strokeWidth?: number;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  score,
  cefrLevel,
  size = 140,
  strokeWidth = 14,
}) => {
  const { theme } = useTheme();

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = (score / 100) * circumference;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.border + "20"}
          strokeWidth={strokeWidth}
          fill="transparent"
        />

        {/* Progress circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.accent}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      {/* Center text */}
      <View style={styles.centerText}>
        <Text style={[styles.score, { color: theme.colors.text.primary }]}>
          {score}
        </Text>
        <View
          style={[styles.levelBadge, { backgroundColor: theme.colors.accent }]}
        >
          <Text style={styles.levelText}>{cefrLevel}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  centerText: {
    position: "absolute",
    alignItems: "center",
  },
  score: {
    fontSize: 42,
    fontWeight: "900",
    marginBottom: -4,
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
  },
  levelText: {
    color: "white",
    fontSize: 14,
    fontWeight: "800",
  },
});
