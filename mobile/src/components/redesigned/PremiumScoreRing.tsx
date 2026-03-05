import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from "react-native-svg";
import { useAppTheme } from "../../theme/useAppTheme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  score: number;
  level: string;
}

export default function PremiumScoreRing({ score, level }: Props) {
  const { theme } = useAppTheme();
  const progress = useSharedValue(0);
  const scale = useSharedValue(0.95);

  const size = 180;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    // Animate ring fill
    progress.value = withTiming(score / 100, {
      duration: 1200,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });

    // Subtle scale animation
    scale.value = withSpring(1, {
      damping: 12,
      stiffness: 100,
    });
  }, [score]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const indicatorColor = theme.gradients.premium[0];

  return (
    <Animated.View
      style={[styles.container, { transform: [{ scale: scale.value }] }]}
    >
      {/* Outer glow effect */}
      <View style={styles.glowContainer}>
        <View
          style={[
            styles.glow,
            {
              backgroundColor: indicatorColor,
              shadowColor: indicatorColor,
              opacity: score > 70 ? 0.3 : 0.15,
            },
          ]}
        />
      </View>

      {/* SVG Ring */}
      <Svg width={size} height={size}>
        <Defs>
          <SvgGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop
              offset="0%"
              stopColor={theme.gradients.premium[0]}
              stopOpacity="1"
            />
            <Stop
              offset="100%"
              stopColor={
                theme.gradients.premium[theme.gradients.premium.length - 1]
              }
              stopOpacity="1"
            />
          </SvgGradient>
        </Defs>

        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.border}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          opacity={0.3}
        />

        {/* Progress ring */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ringGradient)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      {/* Center content */}
      <View style={styles.centerContent}>
        <Text
          style={[styles.scoreNumber, { color: theme.colors.text.primary }]}
        >
          {score}
        </Text>
        <Text style={[styles.scoreMax, { color: theme.colors.text.secondary }]}>
          /100
        </Text>
      </View>

      {/* Inner circle decoration */}
      <View
        style={[styles.innerCircle, { backgroundColor: theme.colors.surface }]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  glowContainer: {
    position: "absolute",
    width: 200,
    height: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  glow: {
    width: 160,
    height: 160,
    borderRadius: 80,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
  },
  centerContent: {
    position: "absolute",
    alignItems: "center",
  },
  scoreNumber: {
    fontSize: 56,
    fontWeight: "800",
    letterSpacing: -2,
  },
  scoreMax: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: -4,
  },
  innerCircle: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    zIndex: -1,
  },
});
