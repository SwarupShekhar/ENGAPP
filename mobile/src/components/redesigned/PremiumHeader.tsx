import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../theme/useAppTheme";
import PremiumScoreRing from "./PremiumScoreRing";
import NextGoalIndicator from "./NextGoalIndicator";

const { width } = Dimensions.get("window");

interface Props {
  userName: string;
  greeting: string;
  level: string;
  score: number;
  streak: number;
  goalTarget: number;
  goalLabel: string;
  unreadCount?: number;
  notifCount?: number;
  onChatPress?: () => void;
  onNotifPress?: () => void;
}

export default function PremiumHeader({
  userName,
  greeting,
  level,
  score,
  streak,
  goalTarget,
  goalLabel,
  unreadCount = 0,
  notifCount = 0,
  onChatPress,
  onNotifPress,
}: Props) {
  const { theme } = useAppTheme();
  const fadeIn = useSharedValue(0);
  const slideUp = useSharedValue(30);

  useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 600 });
    slideUp.value = withSpring(0, { damping: 15, stiffness: 100 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
    transform: [{ translateY: slideUp.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Subtle gradient background - adapted to theme */}
      <LinearGradient
        colors={[theme.colors.background, theme.colors.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBg}
      />

      <Animated.View style={[styles.content, animatedStyle]}>
        {/* Top Action Row */}
        <View style={styles.topRow}>
          <View style={styles.greetingSection}>
            <Text
              style={[styles.greeting, { color: theme.colors.text.secondary }]}
            >
              {greeting}
            </Text>
            <View style={styles.nameRow}>
              <Text
                style={[styles.userName, { color: theme.colors.text.primary }]}
              >
                {userName}
              </Text>
              {streak > 0 && (
                <View
                  style={[
                    styles.streakBadge,
                    {
                      backgroundColor: theme.colors.warning + "20",
                      borderColor: theme.colors.warning + "40",
                    },
                  ]}
                >
                  <Text style={styles.fireEmoji}>🔥</Text>
                  <Text
                    style={[styles.streakText, { color: theme.colors.warning }]}
                  >
                    {streak}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.border + "20",
                },
              ]}
              onPress={onChatPress}
            >
              <Ionicons
                name="chatbox-ellipses-outline"
                size={22}
                color={theme.colors.text.primary}
              />
              {unreadCount > 0 && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: theme.colors.error },
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.border + "20",
                },
              ]}
              onPress={onNotifPress}
            >
              <Ionicons
                name="notifications-outline"
                size={22}
                color={theme.colors.text.primary}
              />
              {notifCount > 0 && (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: theme.colors.error },
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {notifCount > 9 ? "9+" : notifCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Hero Score Ring */}
        <View style={styles.scoreSection}>
          <PremiumScoreRing score={score} level={level} />

          {/* Next Goal Indicator */}
          <View style={styles.goalContainer}>
            <NextGoalIndicator
              currentScore={score}
              goalTarget={goalTarget}
              goalLabel={goalLabel}
            />
          </View>
        </View>

        {/* Level Badge */}
        <View style={styles.levelBadge}>
          <BlurView
            intensity={20}
            tint={theme.variation === "deep" ? "dark" : "light"}
            style={styles.levelBadgeBlur}
          >
            <Text style={styles.levelIcon}>🎯</Text>
            <Text
              style={[styles.levelText, { color: theme.colors.text.primary }]}
            >
              {level}
            </Text>
          </BlurView>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  gradientBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    position: "relative",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  headerActions: {
    flexDirection: "row",
    gap: 12,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
  },
  greetingSection: {
    flex: 1,
  },
  greeting: {
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  userName: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.8,
    marginRight: 10,
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  fireEmoji: {
    fontSize: 12,
    marginRight: 2,
  },
  streakText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  scoreSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  goalContainer: {
    marginTop: 24,
    width: "100%",
  },
  levelBadge: {
    position: "absolute",
    top: -10, // Adjust to stay clear of top icons
    right: 0,
    borderRadius: 16,
    overflow: "hidden",
    opacity: 0, // Hidden for now as we have action icons at the top right
  },
  levelBadgeBlur: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  levelIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  levelText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
