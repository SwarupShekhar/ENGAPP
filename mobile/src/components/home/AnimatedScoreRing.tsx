import React, { useEffect } from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
  withSpring,
} from "react-native-reanimated";
import { Svg, Circle, G } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface Props {
  score: number; // 0-100
  size?: number; // diameter in px
  strokeWidth?: number;
  color?: string;
}

export default function AnimatedScoreRing({
  score,
  size = 96,
  strokeWidth = 8,
  color = "#10B981",
}: Props) {
  const progress = useSharedValue(0);
  const animatedScore = useSharedValue(0);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    progress.value = withTiming(score / 100, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
    animatedScore.value = withSpring(score, { damping: 20, stiffness: 60 });
  }, [score]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const textProps = useAnimatedProps(() => ({
    text: `${Math.round(animatedScore.value)}`,
  } as any));

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          {/* Background circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Animated progress circle */}
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            strokeLinecap="round"
          />
        </G>
      </Svg>

      {/* Center score label */}
      <View style={styles.centerLabel}>
        <AnimatedTextInput
          underlineColorAndroid="transparent"
          editable={false}
          value={`${Math.round(score)}`}
          style={styles.scoreText}
          animatedProps={textProps}
        />
        <Text style={styles.maxText}>/100</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  centerLabel: {
    position: "absolute",
    alignItems: "center",
  },
  scoreText: {
    fontSize: 24,
    fontWeight: "800",
    color: "white",
  },
  maxText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.7)",
    fontWeight: "600",
  },
});
