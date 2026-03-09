import React, { useMemo } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Svg, {
  Polygon,
  Line,
  Text as SvgText,
  Circle,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import Animated, { FadeInDown } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { useAppTheme } from "../../theme/useAppTheme";
import { baseTheme } from "../../theme/base";

interface SkillRadarChartProps {
  grammar: number;
  vocabulary: number;
  fluency: number;
  pronunciation: number;
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_SIZE = SCREEN_WIDTH - 80;
const CENTER = CHART_SIZE / 2;
const RADIUS = CHART_SIZE / 2 - 40;

export const SkillRadarChart: React.FC<SkillRadarChartProps> = ({
  grammar,
  vocabulary,
  fluency,
  pronunciation,
}) => {
  const theme = useAppTheme();

  const axes = [
    { label: "Grammar", value: grammar, angle: -90 },
    { label: "Vocab", value: vocabulary, angle: 0 },
    { label: "Fluency", value: fluency, angle: 90 },
    { label: "Pronunciation", value: pronunciation, angle: 180 },
  ];

  const dataPoints = useMemo(() => {
    return axes
      .map((axis) => {
        const angleRad = (axis.angle * Math.PI) / 180;
        const valueRatio = Math.min(100, Math.max(0, axis.value)) / 100;
        const r = valueRatio * RADIUS;
        const x = CENTER + r * Math.cos(angleRad);
        const y = CENTER + r * Math.sin(angleRad);
        return `${x},${y}`;
      })
      .join(" ");
  }, [grammar, vocabulary, fluency, pronunciation]);

  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.container}>
      <View style={styles.glassContainer}>
        <BlurView intensity={30} tint="light" style={styles.blur} />
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>
            Skill Balance
          </Text>

          <View style={styles.chartContainer}>
            <Svg height={CHART_SIZE} width={CHART_SIZE}>
              <Defs>
                <LinearGradient id="radarGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop
                    offset="0"
                    stopColor={theme.colors.primary}
                    stopOpacity="0.6"
                  />
                  <Stop
                    offset="1"
                    stopColor={theme.colors.secondary}
                    stopOpacity="0.4"
                  />
                </LinearGradient>
              </Defs>

              {gridLevels.map((level, i) => {
                const r = RADIUS * level;
                const points = axes
                  .map((axis) => {
                    const angleRad = (axis.angle * Math.PI) / 180;
                    const x = CENTER + r * Math.cos(angleRad);
                    const y = CENTER + r * Math.sin(angleRad);
                    return `${x},${y}`;
                  })
                  .join(" ");
                return (
                  <Polygon
                    key={`grid-${i}`}
                    points={points}
                    stroke="rgba(0,0,0,0.1)"
                    strokeWidth="1"
                    fill="none"
                  />
                );
              })}

              {axes.map((axis, i) => {
                const angleRad = (axis.angle * Math.PI) / 180;
                const x = CENTER + RADIUS * Math.cos(angleRad);
                const y = CENTER + RADIUS * Math.sin(angleRad);
                return (
                  <Line
                    key={`axis-${i}`}
                    x1={CENTER}
                    y1={CENTER}
                    x2={x}
                    y2={y}
                    stroke="rgba(0,0,0,0.1)"
                    strokeWidth="1"
                  />
                );
              })}

              <Polygon
                points={dataPoints}
                fill="url(#radarGrad)"
                stroke={theme.colors.primary}
                strokeWidth="2"
              />

              {axes.map((axis, i) => {
                const angleRad = (axis.angle * Math.PI) / 180;
                const valueRatio = Math.min(100, Math.max(0, axis.value)) / 100;
                const r = valueRatio * RADIUS;
                const x = CENTER + r * Math.cos(angleRad);
                const y = CENTER + r * Math.sin(angleRad);

                const labelLower = axis.label.toLowerCase();
                const skillKey = (
                  labelLower === "vocab" ? "vocabulary" : labelLower
                ) as keyof typeof theme.tokens.skill;

                const skillColor =
                  theme.tokens.skill[skillKey] || theme.colors.primary;

                return (
                  <Circle
                    key={`dot-${i}`}
                    cx={x}
                    cy={y}
                    r="5"
                    fill={skillColor}
                    stroke="white"
                    strokeWidth="2"
                  />
                );
              })}

              {axes.map((axis, i) => {
                const angleRad = (axis.angle * Math.PI) / 180;
                const labelR = RADIUS + 25;
                const x = CENTER + labelR * Math.cos(angleRad);
                const y = CENTER + labelR * Math.sin(angleRad);

                const labelLower = axis.label.toLowerCase();
                const skillKey = (
                  labelLower === "vocab" ? "vocabulary" : labelLower
                ) as keyof typeof theme.tokens.skill;

                const skillColor =
                  theme.tokens.skill[skillKey] || theme.colors.text.secondary;

                return (
                  <SvgText
                    key={`label-${i}`}
                    x={x}
                    y={y}
                    fill={skillColor}
                    fontSize="12"
                    fontWeight="800"
                    textAnchor="middle"
                    alignmentBaseline="middle"
                  >
                    {axis.label}
                  </SvgText>
                );
              })}
            </Svg>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: baseTheme.spacing.m,
    marginBottom: baseTheme.spacing.l,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  glassContainer: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    position: "relative",
  },
  blur: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    padding: baseTheme.spacing.l,
    alignItems: "center",
  },
  title: {
    fontSize: baseTheme.typography.sizes.l,
    fontWeight: "bold",
    marginBottom: baseTheme.spacing.m,
    alignSelf: "flex-start",
  },
  chartContainer: {
    alignItems: "center",
    justifyContent: "center",
    height: CHART_SIZE,
  },
});
