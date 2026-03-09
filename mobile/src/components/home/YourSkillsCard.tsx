import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient,
  Stop,
  G,
} from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  interpolate,
  useAnimatedProps,
  FadeInDown,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../theme/useAppTheme";
import { SEMANTIC_TOKENS, SkillType } from "../../theme/semanticTokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Constants ──────────────────────────────────────────────────
const GAUGE_WIDTH = 140;
const GAUGE_HEIGHT = 80;
const RADIUS = 60;
const STROKE_WIDTH = 12;
// Pivot at bottom-center of the semicircle arc (needle rotates here)
const CENTER_X = GAUGE_WIDTH / 2;
const CENTER_Y = GAUGE_HEIGHT + 10;

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);

function SpeedometerGauge({ score }: { score: number }) {
  const theme = useAppTheme();
  const rotation = useSharedValue(-180); // Start at far left (0 score)
  const progress = useSharedValue(0);

  useEffect(() => {
    // Map score 0-100 to needle angle: -180° (left) to 0° (right)
    const targetDegrees = (score / 100) * 180 - 180;

    rotation.value = withDelay(
      400,
      withSpring(targetDegrees, {
        damping: 12,
        stiffness: 100,
        mass: 0.8,
      }),
    );

    progress.value = withDelay(
      400,
      withTiming(score / 100, {
        duration: 1200,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      }),
    );
  }, [score]);

  const animatedProps = useAnimatedProps(() => ({
    transform: [{ rotate: `${rotation.value}deg` }] as any,
  }));

  const circumference = RADIUS * Math.PI;
  const animatedPathProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const arcPath = `M ${CENTER_X - RADIUS} ${CENTER_Y} A ${RADIUS} ${RADIUS} 0 0 1 ${CENTER_X + RADIUS} ${CENTER_Y}`;

  // Ticks every 10 points
  const ticks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  return (
    <View style={styles.gaugeContainer}>
      <Svg width={GAUGE_WIDTH} height={GAUGE_HEIGHT + 25}>
        <Defs>
          <LinearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={SEMANTIC_TOKENS.skill.grammar} />
            <Stop
              offset="33%"
              stopColor={SEMANTIC_TOKENS.skill.pronunciation}
            />
            <Stop offset="66%" stopColor={SEMANTIC_TOKENS.skill.fluency} />
            <Stop offset="100%" stopColor={SEMANTIC_TOKENS.skill.vocabulary} />
          </LinearGradient>
          <LinearGradient id="needleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop
              offset="0%"
              stopColor={
                theme.id.includes("dark") ? "rgba(255,255,255,0.8)" : "#111827"
              }
            />
            <Stop
              offset="100%"
              stopColor={SEMANTIC_TOKENS.skill.pronunciation}
            />
          </LinearGradient>
        </Defs>

        {/* Gray Track Background */}
        <Path
          d={arcPath}
          fill="none"
          stroke={
            theme.id.includes("dark") ? "rgba(255,255,255,0.08)" : "#F3F4F6"
          }
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
        />

        {/* Dynamic Gradient Fill */}
        <AnimatedPath
          d={arcPath}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedPathProps}
        />

        {/* Measuring Stick (Ticks) */}
        {ticks.map((t) => {
          const angle = (t / 100) * 180 - 180;
          const rad = (angle * Math.PI) / 180;
          const isMajor = t % 20 === 0;
          const innerR = RADIUS - (isMajor ? 18 : 15);
          const outerR = RADIUS - 12;
          const x1 = CENTER_X + innerR * Math.cos(rad);
          const y1 = CENTER_Y + innerR * Math.sin(rad);
          const x2 = CENTER_X + outerR * Math.cos(rad);
          const y2 = CENTER_Y + outerR * Math.sin(rad);
          return (
            <Path
              key={t}
              d={`M ${x1} ${y1} L ${x2} ${y2}`}
              stroke={
                theme.id.includes("dark") ? "rgba(255,255,255,0.2)" : "#D1D5DB"
              }
              strokeWidth={isMajor ? 1.5 : 1}
            />
          );
        })}

        {/* Pointer / Needle: wrap in G with translate so pivot is at arc bottom-center */}
        <G transform={`translate(${CENTER_X}, ${CENTER_Y})`}>
          <AnimatedG animatedProps={animatedProps}>
            {/* Tapered Needle Body — drawn from pivot (0,0) pointing right; rotation sweeps left→right */}
            <Path
              d={`M 0 -2 L ${RADIUS - 8} 0 L 0 2 Z`}
              fill={theme.id.includes("dark") ? "white" : "#111827"}
              opacity={0.9}
            />
            <Circle
              cx={RADIUS - 8}
              cy={0}
              r={2.5}
              fill={SEMANTIC_TOKENS.skill.pronunciation}
            />
            <Circle
              cx={0}
              cy={0}
              r={6}
              fill={theme.id.includes("dark") ? "white" : "#111827"}
            />
            <Circle
              cx={0}
              cy={0}
              r={2.5}
              fill={theme.id.includes("dark") ? "#111827" : "white"}
            />
          </AnimatedG>
        </G>
      </Svg>

      {/* Labels */}
      <View style={styles.gaugeLabels}>
        <Text
          style={[styles.gaugeLabel, { color: theme.colors.text.secondary }]}
        >
          0
        </Text>
        <Text
          style={[styles.gaugeLabel, { color: theme.colors.text.secondary }]}
        >
          100
        </Text>
      </View>

      <View style={styles.averageScoreContainer}>
        <Text
          style={[
            styles.averageScoreValue,
            { color: theme.colors.text.primary },
          ]}
        >
          {Math.round(score)}
        </Text>
        <Text
          style={[
            styles.averageScoreLabel,
            { color: theme.colors.text.secondary },
          ]}
        >
          Avg Score
        </Text>
      </View>
    </View>
  );
}

// ─── Skill Accordion Row ──────────────────────────────────────────
interface SkillData {
  type: SkillType;
  label: string;
  score: number;
  delta?: string;
  subtext: string;
  expandedDetails: {
    items: string[];
    actionLabel: string;
    onAction: () => void;
  };
}

function SkillAccordionRow({
  data,
  isExpanded,
  onToggle,
}: {
  data: SkillData;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const theme = useAppTheme();
  const isDark = theme.id.includes("dark");
  const skillColor = SEMANTIC_TOKENS.skill[data.type];
  const skillTint = isDark
    ? SEMANTIC_TOKENS.skillTintDark[data.type]
    : SEMANTIC_TOKENS.skillTint[data.type];

  return (
    <View style={styles.rowWrapper}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onToggle();
        }}
        style={[
          styles.rowHeader,
          { borderBottomColor: theme.colors.border },
          isExpanded && { borderBottomWidth: 0 },
        ]}
      >
        <View style={styles.rowLeft}>
          <Text
            style={[styles.skillLabel, { color: theme.colors.text.primary }]}
          >
            {data.label}
          </Text>
          {!isExpanded && (
            <Text
              style={[
                styles.skillSubtext,
                { color: theme.colors.text.secondary },
              ]}
              numberOfLines={1}
            >
              {data.subtext}
            </Text>
          )}
        </View>

        <View style={styles.rowRight}>
          <Text style={[styles.skillScore, { color: skillColor }]}>
            {data.score}
          </Text>
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={skillColor}
          />
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View
          style={[
            styles.expandedContent,
            { backgroundColor: skillTint + "50" },
          ]}
        >
          <View style={styles.detailsList}>
            {data.expandedDetails.items.map((item, idx) => (
              <View key={idx} style={styles.detailItem}>
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={skillColor}
                />
                <Text
                  style={[
                    styles.detailText,
                    { color: theme.colors.text.secondary },
                  ]}
                >
                  {item}
                </Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: skillTint }]}
            onPress={data.expandedDetails.onAction}
          >
            <Text style={[styles.actionButtonText, { color: skillColor }]}>
              {data.expandedDetails.actionLabel}
            </Text>
            <Ionicons name="arrow-forward" size={14} color={skillColor} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Main YourSkillsCard ──────────────────────────────────────────
export default function YourSkillsCard({
  grammar,
  pronunciation,
  fluency,
  vocabulary,
  avgScore,
  deltaLabel,
  details,
}: {
  grammar: number;
  pronunciation: number;
  fluency: number;
  vocabulary: number;
  avgScore: number;
  deltaLabel?: string;
  details?: Record<string, { items: string[]; subtext: string }>;
}) {
  const theme = useAppTheme();
  const [expandedRow, setExpandedRow] = useState<SkillType | null>(null);

  const skillsData: SkillData[] = useMemo(() => {
    return [
      {
        type: "grammar",
        label: "Grammar",
        score: grammar,
        subtext: details?.grammar?.subtext || "Looking solid",
        expandedDetails: {
          items: details?.grammar?.items || [
            "Consistent sentence structure",
            "Proper tense usage",
          ],
          actionLabel: "See Error Log",
          onAction: () => {},
        },
      },
      {
        type: "pronunciation",
        label: "Pronunciation",
        score: pronunciation,
        subtext: details?.pronunciation?.subtext || "Clear articulation",
        expandedDetails: {
          items: details?.pronunciation?.items || [
            "Clear vowel sounds",
            "Natural intonation",
          ],
          actionLabel: "Analyze Practice",
          onAction: () => {},
        },
      },
      {
        type: "fluency",
        label: "Fluency",
        score: fluency,
        subtext: details?.fluency?.subtext || "Smooth delivery",
        expandedDetails: {
          items: details?.fluency?.items || [
            "Steady speech rate",
            "Minimal interruptions",
          ],
          actionLabel: "View Timeline",
          onAction: () => {},
        },
      },
      {
        type: "vocabulary",
        label: "Vocabulary",
        score: vocabulary,
        subtext: details?.vocabulary?.subtext || "Growing variety",
        expandedDetails: {
          items: details?.vocabulary?.items || [
            "Good word choice",
            "Appropriate range",
          ],
          actionLabel: "Expand Bank",
          onAction: () => {},
        },
      },
    ];
  }, [grammar, pronunciation, fluency, vocabulary, details]);

  return (
    <Animated.View
      entering={FadeInDown.duration(800).springify()}
      style={[
        styles.cardContainer,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>
            Your Skills
          </Text>
          <Text
            style={[styles.subtitle, { color: theme.colors.text.secondary }]}
          >
            {deltaLabel || "Since last session"}
          </Text>
        </View>
        <SpeedometerGauge score={avgScore} />
      </View>

      <View style={styles.rowsContainer}>
        {skillsData.map((skill, index) => (
          <Animated.View
            key={skill.type}
            entering={FadeInDown.delay(600 + index * 100).springify()}
          >
            <SkillAccordionRow
              data={skill}
              isExpanded={expandedRow === skill.type}
              onToggle={() =>
                setExpandedRow(expandedRow === skill.type ? null : skill.type)
              }
            />
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.85)", // Light theme default
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.6)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  gaugeContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: -20,
  },
  averageScoreContainer: {
    position: "absolute",
    bottom: 0,
    alignItems: "center",
  },
  averageScoreValue: {
    fontSize: 22,
    fontWeight: "900",
  },
  averageScoreLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  rowsContainer: {
    marginTop: 20,
  },
  rowWrapper: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowLeft: {
    flex: 1,
  },
  skillLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  skillSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  skillScore: {
    fontSize: 18,
    fontWeight: "800",
  },
  expandedContent: {
    padding: 12,
    gap: 12,
  },
  detailsList: {
    gap: 6,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 14,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  gaugeLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: GAUGE_WIDTH + 10,
    paddingHorizontal: 0,
    marginTop: -25,
  },
  gaugeLabel: {
    fontSize: 9,
    fontWeight: "800",
    opacity: 0.5,
  },
});
