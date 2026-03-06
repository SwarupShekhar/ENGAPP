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
import Svg, { Path } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SocketService from "../services/socketService";

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

      // Real-time unread count listener
      const handleNewMessage = (data: any) => {
        console.log(
          "[HomeScreen] Real-time message received, updating unread counts",
        );
        // Re-fetch only unread counts and pending requests to minimize overhead
        Promise.all([
          chatApi.getUnreadCount(),
          connectionsApi.getPendingRequests(),
        ])
          .then(([unreadData, pendingReqs]) => {
            setUnreadCount(unreadData.count || 0);
            setNotifCount(Array.isArray(pendingReqs) ? pendingReqs.length : 0);
          })
          .catch((err) =>
            console.warn("[HomeScreen] Real-time fetch error:", err),
          );
      };

      const socketSrv = SocketService.getInstance();
      socketSrv.onNewMessage(handleNewMessage);

      return () => {
        socketSrv.offNewMessage(handleNewMessage);
      };
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
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
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
            </View>

            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              {header.latestAssessmentId && (
                <TouchableOpacity
                  style={styles.retakeBtn}
                  onPress={() =>
                    navigation.navigate("AssessmentResult", {
                      sessionId: header.latestAssessmentId,
                    })
                  }
                >
                  <Ionicons name="stats-chart" size={12} color="white" />
                  <Text style={styles.retakeText}>Results</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.retakeBtn}
                onPress={() => navigation.navigate("AssessmentIntro")}
              >
                <Ionicons name="refresh" size={12} color="white" />
                <Text style={styles.retakeText}>Retake</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Curved wave transition */}
      <View style={styles.waveContainer}>
        <Svg
          width="100%"
          height={30}
          viewBox="0 0 400 30"
          preserveAspectRatio="none"
          style={styles.waveSvg}
        >
          <Path
            d="M0,0 L0,5 Q200,40 400,5 L400,0 Z"
            fill={
              theme.colors.gradients.primary[
                theme.colors.gradients.primary.length - 1
              ]
            }
          />
        </Svg>
      </View>

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
            style={[styles.mainCTA, { backgroundColor: theme.colors.surface }]}
            onPress={() => handleCTAAction(primaryCTA.action, primaryCTA.data)}
            activeOpacity={0.9}
          >
            <BlurView
              intensity={theme.variation === "deep" ? 30 : 60}
              tint={theme.variation === "deep" ? "dark" : "light"}
              style={styles.ctaBlur}
            >
              <View style={styles.ctaContent}>
                <View style={styles.ctaTextSection}>
                  <Text
                    style={[
                      styles.ctaTitle,
                      { color: theme.colors.text.primary },
                    ]}
                  >
                    {primaryCTA.title}
                  </Text>
                  <Text
                    style={[
                      styles.ctaDesc,
                      { color: theme.colors.text.secondary },
                    ]}
                  >
                    {primaryCTA.description}
                  </Text>
                </View>

                {/* New Action Row with avatars and soundwave button */}
                <View style={styles.actionRow}>
                  {/* Left Avatar (Robot/Maya) */}
                  <View style={styles.avatarWrapper}>
                    <View
                      style={[
                        styles.avatarCircle,
                        { backgroundColor: theme.colors.primary + "30" },
                      ]}
                    >
                      <Ionicons
                        name="construct-outline"
                        size={24}
                        color={theme.colors.primary}
                      />
                    </View>
                    <View style={styles.liveBadge}>
                      <Text style={styles.liveBadgeText}>LIVE</Text>
                    </View>
                  </View>

                  {/* Primary Button */}
                  <LinearGradient
                    colors={theme.colors.gradients.primary as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.ctaButtonPremium}
                  >
                    <View style={styles.buttonInner}>
                      <Text style={styles.ctaButtonText}>
                        {primaryCTA.buttonText}
                      </Text>
                      <Ionicons
                        name="arrow-forward"
                        size={16}
                        color="white"
                        style={{ marginLeft: 8 }}
                      />
                      <View style={styles.soundwaves}>
                        <View style={[styles.wave, { height: 12 }]} />
                        <View style={[styles.wave, { height: 20 }]} />
                        <View style={[styles.wave, { height: 15 }]} />
                        <View style={[styles.wave, { height: 24 }]} />
                      </View>
                    </View>
                  </LinearGradient>

                  {/* Right Avatar (Partner) */}
                  <View style={styles.avatarWrapper}>
                    <View
                      style={[
                        styles.avatarCircle,
                        { backgroundColor: theme.colors.surface + "40" },
                      ]}
                    >
                      <Ionicons
                        name="person"
                        size={24}
                        color={theme.colors.text.secondary}
                      />
                    </View>
                    <View style={styles.liveBadge}>
                      <Text style={styles.liveBadgeText}>LIVE</Text>
                    </View>
                    <View style={styles.flagBadge}>
                      <Text style={{ fontSize: 10 }}>🇬🇧</Text>
                    </View>
                  </View>
                </View>
              </View>

              {primaryCTA.mayaChip && (
                <View
                  style={[
                    styles.mayaChipContainerCentered,
                    { borderTopColor: "rgba(255,255,255,0.2)" },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.mayaChipSimple}
                    onPress={() => handleCTAAction(primaryCTA.mayaChip.action)}
                  >
                    <Ionicons
                      name="sparkles"
                      size={16}
                      color={theme.colors.primary}
                    />
                    <Text
                      style={[
                        styles.mayaChipText,
                        { color: theme.colors.primary, marginLeft: 6 },
                      ]}
                    >
                      {primaryCTA.mayaChip.label}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </BlurView>
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
      marginTop: -20,
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
      borderRadius: 28,
      overflow: "hidden",
      ...theme.shadows.large,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
    },
    ctaBlur: {
      width: "100%",
    },
    waveContainer: {
      marginTop: -1,
      backgroundColor: "transparent",
    },
    waveSvg: {
      marginBottom: -1,
    },
    ctaContent: {
      padding: 24,
    },
    ctaTextSection: {
      marginBottom: 20,
    },
    ctaTitle: {
      fontSize: 26,
      fontWeight: "800",
      marginBottom: 10,
      letterSpacing: -0.8,
      textAlign: "left",
    },
    ctaDesc: {
      fontSize: 16,
      lineHeight: 22,
      opacity: 0.8,
      textAlign: "left",
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      gap: 12,
    },
    avatarWrapper: {
      position: "relative",
      alignItems: "center",
      justifyContent: "center",
    },
    avatarCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: theme.colors.surface,
    },
    liveBadge: {
      position: "absolute",
      bottom: -4,
      backgroundColor: theme.colors.success,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.colors.surface,
    },
    liveBadgeText: {
      color: "white",
      fontSize: 8,
      fontWeight: "bold",
    },
    flagBadge: {
      position: "absolute",
      top: -2,
      right: -2,
      backgroundColor: "white",
      width: 14,
      height: 14,
      borderRadius: 7,
      justifyContent: "center",
      alignItems: "center",
      elevation: 2,
    },
    ctaButtonPremium: {
      flex: 1,
      height: 56,
      borderRadius: 28,
      overflow: "hidden",
    },
    buttonInner: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    ctaButtonText: {
      color: "white",
      fontWeight: "700",
      fontSize: 18,
      letterSpacing: -0.2,
    },
    soundwaves: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      marginLeft: 10,
    },
    wave: {
      width: 2,
      backgroundColor: "rgba(255,255,255,0.5)",
      borderRadius: 1,
    },
    mayaChipContainerCentered: {
      width: "100%",
      borderTopWidth: 1,
      paddingVertical: 14,
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.1)",
    },
    mayaChipSimple: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    mayaChipText: {
      fontSize: 15,
      fontWeight: "700",
      letterSpacing: -0.3,
    },
    footerSpacer: {
      height: 100,
    },
  });
