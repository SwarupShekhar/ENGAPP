import { useUser } from "@clerk/clerk-expo";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAppTheme } from "../theme/useAppTheme";
import { ConnectPracticeCard } from "../components/home/ConnectPracticeCard";
import { FeedbackReadyCard } from "../components/home/FeedbackReadyCard";
import { SkillRingsRow } from "../components/home/SkillRingsRow";
import WeeklyActivityGrid from "../components/home/WeeklyActivityGrid";
import { ContextualCard } from "../components/home/ContextualCard";
import AnimatedScoreRing from "../components/home/AnimatedScoreRing";
import NextGoalBar from "../components/home/NextGoalBar";
import { userApi, UserStats } from "../api/user";
import { chatApi, connectionsApi } from "../api/connections";
import { getHomeData, HomeData } from "../api/home";

export default function HomeScreen() {
  const { user, isLoaded } = useUser();
  const navigation: any = useNavigation();
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoaded && user && !user.firstName) {
      navigation.replace("CreateProfile");
    }
  }, [isLoaded, user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      const fetchData = async () => {
        try {
          // 1. Instant load from local cache
          const cachedHome = await AsyncStorage.getItem("@home_data_cache");
          if (cachedHome) {
            setHomeData(JSON.parse(cachedHome));
            setLoading(false);
          }

          // 2. Fresh data
          const [homeDataResp, unreadData, pendingReqs] = await Promise.all([
            getHomeData(),
            chatApi.getUnreadCount(),
            connectionsApi.getPendingRequests(),
          ]);

          setHomeData(homeDataResp);
          setUnreadCount(unreadData.count || 0);
          const pendingCount = Array.isArray(pendingReqs)
            ? pendingReqs.length
            : 0;
          setNotifCount(pendingCount);

          AsyncStorage.setItem(
            "@home_data_cache",
            JSON.stringify(homeDataResp),
          );
          AsyncStorage.setItem(
            "@home_unread_cache",
            JSON.stringify(unreadData.count || 0),
          );
          AsyncStorage.setItem(
            "@home_notif_cache",
            JSON.stringify(pendingCount),
          );
        } catch (error) {
          console.error("Failed to fetch home data:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }, [user]),
  );

  const handleCTAAction = (action: string, data?: any) => {
    switch (action) {
      case "navigate_to_practice":
        navigation.navigate("CallPreference");
        break;
      case "start_maya_session":
        navigation.navigate("AITutor");
        break;
      case "start_assessment":
        navigation.navigate("AssessmentIntro");
        break;
      case "open_maya_chat":
        navigation.navigate("AITutor");
        break;
      default:
        console.log("Unhandled action:", action, data);
    }
  };

  if (!isLoaded || !homeData) return null;

  const { header, primaryCTA, skills, contextualCards } = homeData;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.colors.primary}
      />

      {/* Gradient Header */}
      <LinearGradient
        colors={theme.colors.gradients.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <SafeAreaView edges={["top"]}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.avatarContainer}>
                {user?.imageUrl ? (
                  <Image
                    source={{ uri: user.imageUrl }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <Text style={styles.avatarText}>
                    {header.userName.charAt(0)}
                  </Text>
                )}
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.greetingSmall}>
                  {header.greeting.split("!")[0]}
                </Text>
                <Text style={styles.greeting} numberOfLines={1}>
                  {header.userName} 👋
                </Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              {header.streak > 0 && (
                <View style={styles.streakBadge}>
                  <Text style={styles.streakEmoji}>🔥</Text>
                  <Text style={styles.streakText}>{header.streak}</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.notifBtn}
                onPress={() => navigation.navigate("Conversations")}
              >
                <Ionicons
                  name="chatbox-ellipses-outline"
                  size={22}
                  color="white"
                />
                {unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.notifBtn}
                onPress={() => navigation.navigate("Notifications")}
              >
                <Ionicons
                  name="notifications-outline"
                  size={22}
                  color="white"
                />
                {notifCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {notifCount > 9 ? "9+" : notifCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.scoreRow}>
            <AnimatedScoreRing score={header.score} size={84} />
            <View style={styles.goalBarContainer}>
              <NextGoalBar
                currentScore={header.score}
                goalTarget={header.goalTarget || 100}
                goalLabel={header.goalLabel || "Target"}
              />
            </View>
          </View>

          {/* Level badge in header */}
          <View style={styles.levelRow}>
            <View style={styles.levelBadge}>
              <Ionicons
                name="shield-checkmark"
                size={14}
                color={theme.colors.warning}
              />
              <Text style={styles.levelText}>Level {header.level}</Text>
            </View>
            {header.percentile && (
              <View style={styles.percentileBadge}>
                <Text style={styles.percentileText}>{header.percentile}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.retakeBtn}
              onPress={() => navigation.navigate("AssessmentIntro")}
            >
              <Ionicons name="refresh" size={12} color="white" />
              <Text style={styles.retakeText}>Retake Test</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        {/* Dynamic primary CTA */}
        <Animated.View
          entering={FadeInDown.delay(100)}
          style={styles.ctaContainer}
        >
          <TouchableOpacity
            style={[
              styles.mainCTA,
              {
                borderLeftColor: primaryCTA.accentColor || theme.colors.primary,
              },
            ]}
            onPress={() => handleCTAAction(primaryCTA.action, primaryCTA.data)}
          >
            <View style={styles.ctaTextSection}>
              <Text style={styles.ctaTitle}>{primaryCTA.title}</Text>
              <Text style={styles.ctaDesc}>{primaryCTA.description}</Text>
              <View
                style={[
                  styles.ctaButton,
                  {
                    backgroundColor:
                      primaryCTA.accentColor || theme.colors.primary,
                  },
                ]}
              >
                <Text style={styles.ctaButtonText}>
                  {primaryCTA.buttonText}
                </Text>
                <Ionicons name="arrow-forward" size={16} color="white" />
              </View>
            </View>
            <View style={styles.mayaChipContainer}>
              <TouchableOpacity
                style={styles.mayaChip}
                onPress={() => handleCTAAction(primaryCTA.mayaChip.action)}
              >
                <Ionicons
                  name="sparkles"
                  size={14}
                  color={theme.colors.primary}
                />
                <Text style={styles.mayaChipText}>
                  {primaryCTA.mayaChip.label}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Skill Matrix */}
        <View>
          <SkillRingsRow
            grammar={skills.scores.grammar || 0}
            pronunciation={skills.scores.pronunciation || 0}
            fluency={skills.scores.fluency || 0}
            vocabulary={skills.scores.vocabulary || 0}
            deltas={skills.deltas}
            masteryFlags={skills.masteryFlags}
            deltaLabel={skills.deltaLabel}
          />
        </View>

        {/* Weekly Activity */}
        <View>
          <WeeklyActivityGrid activity={homeData.weeklyActivity} />
        </View>

        {/* Contextual Cards */}
        {contextualCards.map((card, idx) => (
          <ContextualCard
            key={`${card.type}-${idx}`}
            type={card.type}
            data={card.data}
            index={idx}
            onPress={handleCTAAction}
          />
        ))}

        {/* Feedback Card (Legacy fallback) */}
        {!contextualCards.some((c) => c.type === "weekly_progress") && (
          <View>
            <FeedbackReadyCard
              onPress={() => navigation.navigate("Feedback")}
              overallScore={skills.avgScore}
            />
          </View>
        )}

        <View style={styles.footerSpacer} />
      </ScrollView>
    </View>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    headerGradient: {
      paddingBottom: theme.spacing.l,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: theme.spacing.l,
      paddingTop: theme.spacing.s,
      paddingBottom: theme.spacing.m,
      overflow: "visible",
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flexShrink: 1,
      marginRight: 8,
    },
    avatarContainer: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: "rgba(255,255,255,0.25)",
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.5)",
    },
    avatarImage: {
      width: "100%",
      height: "100%",
    },
    avatarText: {
      color: "white",
      fontWeight: "bold",
      fontSize: 18,
    },
    greetingSmall: {
      fontSize: 12,
      color: "rgba(255,255,255,0.7)",
      fontWeight: "500",
    },
    greeting: {
      fontSize: 20,
      fontWeight: "800",
      color: "white",
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexShrink: 0,
    },
    scoreRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.l,
      marginTop: theme.spacing.m,
      marginBottom: theme.spacing.m,
    },
    goalBarContainer: {
      flex: 1,
      marginLeft: theme.spacing.l,
    },
    streakBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.2)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      gap: 4,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
    },
    streakEmoji: {
      fontSize: 14,
    },
    streakText: {
      color: "white",
      fontSize: 13,
      fontWeight: "700",
    },
    notifBtn: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.2)",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
      position: "relative",
    },
    badge: {
      position: "absolute",
      top: -4,
      right: -4,
      backgroundColor: theme.colors.error,
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 4,
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
    },
    badgeText: {
      color: "white",
      fontSize: 10,
      fontWeight: "bold",
    },
    levelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.l,
      marginTop: theme.spacing.s,
    },
    levelBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "rgba(255,255,255,0.18)",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.25)",
    },
    levelText: {
      color: "white",
      fontSize: 13,
      fontWeight: "700",
    },
    percentileBadge: {
      backgroundColor: "rgba(255,255,255,0.15)",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    percentileText: {
      color: "white",
      fontSize: 11,
      fontWeight: "600",
    },
    retakeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(255,255,255,0.15)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.2)",
    },
    retakeText: {
      color: "white",
      fontSize: 11,
      fontWeight: "600",
    },
    scrollView: {
      flex: 1,
      marginTop: -12,
    },
    scrollContent: {
      paddingTop: theme.spacing.l,
      paddingBottom: theme.spacing.xl,
    },
    ctaContainer: {
      marginHorizontal: theme.spacing.l,
      marginBottom: theme.spacing.l,
    },
    mainCTA: {
      backgroundColor: "white",
      borderRadius: 20,
      padding: theme.spacing.l,
      borderLeftWidth: 6,
      ...theme.shadows.medium,
    },
    ctaTextSection: {
      marginBottom: 16,
    },
    ctaTitle: {
      fontSize: 20,
      fontWeight: "800",
      color: theme.colors.text.primary,
      marginBottom: 4,
    },
    ctaDesc: {
      fontSize: 14,
      color: theme.colors.text.secondary,
      marginBottom: 16,
    },
    ctaButton: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 25,
      gap: 8,
    },
    ctaButtonText: {
      color: "white",
      fontWeight: "700",
      fontSize: 15,
    },
    mayaChipContainer: {
      borderTopWidth: 1,
      borderTopColor: "#f0f0f0",
      paddingTop: 12,
      flexDirection: "row",
      justifyContent: "flex-end",
    },
    mayaChip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.primary + "10",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 15,
      gap: 6,
    },
    mayaChipText: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "700",
    },
    footerSpacer: {
      height: 100,
    },
  });
