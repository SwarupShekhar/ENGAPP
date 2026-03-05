import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withSpring,
  FadeInDown,
} from "react-native-reanimated";
import { useAppTheme } from "../../theme/useAppTheme";

export interface SkillData {
  name: string;
  icon: string;
  score: number;
  delta: number;
  color: string;
}

interface Props {
  skills: SkillData[];
  avgScore: number;
  deltaLabel: string;
}

export default function PremiumSkillsCard({
  skills,
  avgScore,
  deltaLabel,
}: Props) {
  const { theme } = useAppTheme();

  return (
    <Animated.View
      entering={FadeInDown.delay(300).springify()}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          ...theme.shadows.md,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text.primary }]}>
          Your Skills
        </Text>
        <View
          style={[
            styles.avgBadge,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <Text
            style={[styles.avgLabel, { color: theme.colors.text.secondary }]}
          >
            Avg
          </Text>
          <Text style={[styles.avgScore, { color: theme.colors.text.primary }]}>
            {avgScore}
          </Text>
        </View>
      </View>

      {deltaLabel && (
        <Text style={[styles.deltaLabel, { color: theme.colors.text.light }]}>
          {deltaLabel}
        </Text>
      )}

      {/* Skill Rows */}
      <View style={styles.skillsContainer}>
        {skills.map((skill, index) => (
          <SkillRow
            key={skill.name}
            skill={skill}
            index={index}
            maxScore={100}
            theme={theme}
          />
        ))}
      </View>
    </Animated.View>
  );
}

function SkillRow({
  skill,
  index,
  maxScore,
  theme,
}: {
  skill: SkillData;
  index: number;
  maxScore: number;
  theme: any;
}) {
  const width = useSharedValue(0);
  const deltaOpacity = useSharedValue(0);
  const deltaTranslateY = useSharedValue(-10);

  useEffect(() => {
    const delay = index * 100;

    // Bar animation
    width.value = withDelay(
      delay,
      withSpring(skill.score, {
        damping: 15,
        stiffness: 100,
      }),
    );

    // Delta animation (appears after bar)
    if (skill.delta !== 0) {
      deltaOpacity.value = withDelay(
        delay + 600,
        withTiming(1, { duration: 300 }),
      );
      deltaTranslateY.value = withDelay(
        delay + 600,
        withSpring(0, { damping: 10, stiffness: 100 }),
      );
    }
  }, [skill.score, skill.delta]);

  const barAnimatedStyle = useAnimatedStyle(() => ({
    width: `${(width.value / maxScore) * 100}%`,
  }));

  const deltaAnimatedStyle = useAnimatedStyle(() => ({
    opacity: deltaOpacity.value,
    transform: [{ translateY: deltaTranslateY.value }],
  }));

  return (
    <View style={styles.skillRow}>
      {/* Skill header */}
      <View style={styles.skillHeader}>
        <View style={styles.skillNameSection}>
          <Text style={styles.skillIcon}>{skill.icon}</Text>
          <Text
            style={[styles.skillName, { color: theme.colors.text.primary }]}
          >
            {skill.name}
          </Text>
        </View>

        <View style={styles.scoreSection}>
          <Text style={[styles.score, { color: skill.color }]}>
            {skill.score}
          </Text>

          {skill.delta !== 0 && (
            <Animated.View
              style={[
                styles.deltaChip,
                deltaAnimatedStyle,
                {
                  backgroundColor:
                    skill.delta > 0
                      ? theme.colors.success + "20"
                      : theme.colors.error + "20",
                },
              ]}
            >
              <Text
                style={[
                  styles.deltaText,
                  {
                    color:
                      skill.delta > 0
                        ? theme.colors.success
                        : theme.colors.error,
                  },
                ]}
              >
                {skill.delta > 0 ? "+" : ""}
                {skill.delta}
              </Text>
            </Animated.View>
          )}
        </View>
      </View>

      {/* Progress bar */}
      <View
        style={[
          styles.barContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <Animated.View
          style={[
            styles.barFill,
            { backgroundColor: skill.color },
            barAnimatedStyle,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  avgBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  avgLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginRight: 4,
  },
  avgScore: {
    fontSize: 14,
    fontWeight: "700",
  },
  deltaLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 16,
  },
  skillsContainer: {
    gap: 20,
  },
  skillRow: {
    gap: 10,
  },
  skillHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  skillNameSection: {
    flexDirection: "row",
    alignItems: "center",
  },
  skillIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  skillName: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  scoreSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  score: {
    fontSize: 18,
    fontWeight: "700",
  },
  deltaChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  deltaText: {
    fontSize: 13,
    fontWeight: "600",
  },
  barContainer: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
  },
});
