import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../theme/useAppTheme";
import Animated, { FadeInRight, FadeInDown } from "react-native-reanimated";
import C2MasteryGateCard from "./C2MasteryGateCard";
import ShareJourneyCard from "./ShareJourneyCard";
import WeeklySummaryCard from "./WeeklySummaryCard";

interface ContextualCardProps {
  type: string;
  data: any;
  index?: number;
  onPress?: (action: string, data?: any) => void;
}

export const ContextualCard = ({
  type,
  data,
  index = 0,
  onPress,
}: ContextualCardProps) => {
  const theme = useAppTheme();
  const styles = getStyles(theme);

  const renderContent = () => {
    switch (type) {
      case "weekly_progress":
        return (
          <View style={styles.cardContent}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="calendar"
                size={24}
                color={theme.colors.primary}
              />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.cardTitle}>Weekly Progress</Text>
              <Text style={styles.cardDescription}>{data.label}</Text>
            </View>
          </View>
        );
      case "achievement":
        return (
          <View style={styles.cardContent}>
            <View style={styles.iconContainer}>
              <Ionicons name="trophy" size={24} color={theme.colors.warning} />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.cardTitle}>New Achievements!</Text>
              <View style={styles.badgeRow}>
                {data.badges.map((badge: any, index: number) => (
                  <View key={badge.id} style={styles.badgeIcon}>
                    <Text style={{ fontSize: 20 }}>🏅</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        );
      case "skill_decay_warning":
        return (
          <View
            style={[
              styles.cardContent,
              { backgroundColor: theme.colors.error + "10" },
            ]}
          >
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: theme.colors.error + "20" },
              ]}
            >
              <Ionicons name="warning" size={24} color={theme.colors.error} />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.cardTitle, { color: theme.colors.error }]}>
                Skill Decay Warning
              </Text>
              <Text style={styles.cardDescription}>
                It's been {data.daysSinceActive} days since your last session.
                Practice now to keep your skills sharp!
              </Text>
            </View>
          </View>
        );
      case "beginner_playbook":
        return (
          <View style={styles.cardContent}>
            <View style={styles.iconContainer}>
              <Ionicons name="book" size={24} color={theme.colors.success} />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.cardTitle}>Beginner Playbook</Text>
              {data.tips.map((tip: any) => (
                <Text key={tip.number} style={styles.tipText}>
                  • {tip.text}
                </Text>
              ))}
            </View>
          </View>
        );
      case "trajectory_chart":
        return (
          <View style={styles.cardContent}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="trending-up"
                size={24}
                color={theme.colors.primary}
              />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.cardTitle}>Learning Trajectory</Text>
              <Text style={styles.cardDescription}>
                Steady progress!{" "}
                {data.prediction || "Keep up the consistent practice."}
              </Text>
              {/* Simple Sparkline representation placeholder */}
              <View style={styles.sparklinePlaceholder}>
                <View style={styles.sparklineBar} />
                <View style={[styles.sparklineBar, { height: 16 }]} />
                <View style={[styles.sparklineBar, { height: 22 }]} />
                <View style={[styles.sparklineBar, { height: 18 }]} />
                <View style={[styles.sparklineBar, { height: 28 }]} />
                <View style={[styles.sparklineBar, { height: 32 }]} />
              </View>
            </View>
          </View>
        );
      case "c2_mastery_gate":
        return (
          <C2MasteryGateCard
            criteria={data.criteria}
            pointsRemaining={data.pointsRemaining}
            onPress={(action) => onPress?.(action, data)}
          />
        );
      case "share_journey":
        return (
          <ShareJourneyCard
            startDate={data.startDate}
            startLevel={data.startLevel}
            todayLevel={data.todayLevel}
            pointsGained={data.pointsGained}
          />
        );
      case "weekly_summary":
        return (
          <WeeklySummaryCard
            text={data.text}
            sessionsCount={data.sessionsCount}
            avgScore={data.avgScore}
            highlights={data.highlights || []}
            skillBreakdown={data.skillBreakdown}
            actionableFocus={data.actionableFocus}
            edgeCase={data.edgeCase}
            progressTarget={data.progressTarget}
          />
        );
      default:
        return null;
    }
  };

  const isSpecialCard =
    type === "c2_mastery_gate" ||
    type === "share_journey" ||
    type === "weekly_summary";

  return (
    <Animated.View entering={FadeInDown.delay(index * 60 + 100)}>
      <TouchableOpacity
        style={isSpecialCard ? null : styles.container}
        onPress={() => onPress?.(data.action || "default", data)}
        disabled={!data.action || isSpecialCard}
      >
        {renderContent()}
      </TouchableOpacity>
    </Animated.View>
  );
};

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      marginHorizontal: theme.spacing.l,
      marginBottom: theme.spacing.m,
      padding: theme.spacing.l,
      ...theme.shadows.medium,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.05)",
    },
    cardContent: {
      flexDirection: "row",
      alignItems: "center",
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: theme.colors.primary + "15",
      justifyContent: "center",
      alignItems: "center",
      marginRight: theme.spacing.m,
    },
    textContainer: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.colors.text.primary,
      marginBottom: 2,
    },
    cardDescription: {
      fontSize: 13,
      color: theme.colors.text.secondary,
    },
    badgeRow: {
      flexDirection: "row",
      marginTop: 4,
    },
    badgeIcon: {
      marginRight: 8,
    },
    tipText: {
      fontSize: 13,
      color: theme.colors.text.secondary,
      marginTop: 2,
    },
    sparklinePlaceholder: {
      flexDirection: "row",
      alignItems: "flex-end",
      height: 35,
      gap: 4,
      marginTop: 10,
    },
    sparklineBar: {
      width: 12,
      height: 12,
      backgroundColor: theme.colors.primary + "30",
      borderRadius: 4,
    },
  });
