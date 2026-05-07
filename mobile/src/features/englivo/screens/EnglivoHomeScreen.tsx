import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useUser, useClerk } from "@clerk/clerk-expo";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useAppTheme } from "../../../theme/useAppTheme";
import { ModeSwitcher } from "../../../components/navigation/ModeSwitcher";
import { getHistory, getMe } from "../../../api/englivo/user";
import { getBridgeUser } from "../../../api/bridgeClient";
import { getSessionsCount, getUpcomingSession } from "../../../api/client";
import { SessionHistory, User } from "../../../types/user";

const { width } = Dimensions.get("window");

function nextCefrLevel(current: string): string {
  const order = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const i = order.findIndex((l) => l.toLowerCase() === current.toLowerCase());
  return i >= 0 && i < order.length - 1 ? order[i + 1] : "C2";
}

function formatSessionTime(raw: string | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EnglivoHomeScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation<any>();
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();

  const [userData, setUserData] = useState<User | null>(null);
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cefrLevel, setCefrLevel] = useState("A1");
  const [fluencyScore, setFluencyScore] = useState<number | null>(null);
  const [streakDays, setStreakDays] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [preferredMode, setPreferredMode] = useState<string | null>(null);
  const [sessionsCount, setSessionsCount] = useState(0);
  const [upcomingSession, setUpcomingSession] = useState<any | null>(null);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [authError, setAuthError] = useState(false);

  const load = async () => {
    try {
      setAuthError(false);
      const [me, hist] = await Promise.all([getMe(), getHistory()]);
      setUserData(me);
      setHistory(Array.isArray(hist) ? hist : []);
      if (me?.totalMinutes) setTotalMinutes(me.totalMinutes);

      try {
        const sessionsCnt = await getSessionsCount();
        setSessionsCount(sessionsCnt);
      } catch (error) {
        console.warn("[EnglivoHome] Sessions count error:", error);
        setSessionsCount(0);
      }

      try {
        const upcoming = await getUpcomingSession();
        setUpcomingSession(upcoming);
      } catch (error) {
        console.warn("[EnglivoHome] Upcoming session error:", error);
        setUpcomingSession(null);
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        setAuthError(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  useEffect(() => {
    if (clerkUser?.id) {
      setBridgeLoading(true);
      getBridgeUser(clerkUser.id)
        .then((bridgeUser) => {
          const nextCefr = bridgeUser?.cefrLevel ?? bridgeUser?.cefr_level;
          const nextFluency =
            bridgeUser?.fluencyScore ?? bridgeUser?.fluency_score;
          const nextStreak =
            bridgeUser?.streakDays ?? bridgeUser?.streak_days;
          const nextTotalMinutes =
            bridgeUser?.totalPracticeMinutes ??
            bridgeUser?.total_practice_minutes;
          const nextPreferredMode =
            bridgeUser?.preferredMode ?? bridgeUser?.preferred_mode;

          if (nextCefr) setCefrLevel(nextCefr);
          if (typeof nextFluency === "number") setFluencyScore(nextFluency);
          if (typeof nextStreak === "number") setStreakDays(nextStreak);
          if (typeof nextTotalMinutes === "number")
            setTotalMinutes(nextTotalMinutes);
          if (typeof nextPreferredMode === "string")
            setPreferredMode(nextPreferredMode);
        })
        .catch(() => {})
        .finally(() => setBridgeLoading(false));
    }
  }, [clerkUser?.id]);

  const firstName = userData?.firstName || clerkUser?.firstName || "Learner";
  const streak = streakDays || 0;
  const totalSessions = sessionsCount;
  const effectivePreferredMode = preferredMode ?? "AI";
  const prefersHumanTutor = effectivePreferredMode
    .toLowerCase()
    .includes("human");

  const greeting =
    streak >= 5
      ? "On a roll,"
      : totalSessions > 0
        ? "Welcome back,"
        : "Get started,";

  const focusTitle =
    streak >= 5
      ? "Momentum is strong"
      : totalSessions > 0
        ? "Keep your rhythm"
        : prefersHumanTutor
          ? "Book your first tutor session"
          : "Start your learning streak";
  const focusSubtitle =
    streak >= 5
      ? "You're consistent this week. Push one focused speaking drill today."
      : totalSessions > 0
        ? "A short AI session now will keep your speaking habit active."
        : "Take your first guided speaking session and build momentum.";

  if (authError) {
    return (
      <SafeAreaView style={[styles.safeArea]}>
        <View style={[styles.scrollView, styles.centered, { padding: 32 }]}>
          <Text style={[styles.name, { textAlign: "center", marginBottom: 12 }]}>
            Session Expired
          </Text>
          <Text style={[styles.greeting, { textAlign: "center", marginBottom: 32, lineHeight: 22 }]}>
            Your Englivo session could not be verified. Sign out and sign back in with your Englivo account.
          </Text>
          <TouchableOpacity
            style={styles.bookSessionBtn}
            onPress={() => signOut()}
            activeOpacity={0.85}
          >
            <Text style={styles.bookSessionBtnText}>Sign Out & Re-authenticate</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea]}>
        <View style={[styles.scrollView, styles.centered]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={theme.colors.primary}
          />
        }
      >
        <View style={styles.container}>
          {/* Header */}
          <Animated.View
            entering={FadeInDown.delay(0).duration(400)}
            style={styles.header}
          >
            <View style={styles.headerContent}>
              <View>
                <Text style={styles.greeting}>{greeting}</Text>
                <Text style={styles.name}>{firstName}</Text>
              </View>
            </View>
            <View style={styles.headerControlsRow}>
              <ModeSwitcher style={styles.modeSwitcherCompact} />
              <View style={styles.levelBadge}>
                <Ionicons
                  name="ribbon-outline"
                  size={14}
                  color={theme.colors.background}
                />
                <Text style={styles.levelText}>
                  {bridgeLoading ? "..." : cefrLevel}
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* Stats Row — 2 cards */}
          <Animated.View
            entering={FadeInDown.delay(60).duration(400)}
            style={styles.statsRow}
          >
            <View style={styles.statCard}>
              <View style={styles.statIconContainer}>
                <Ionicons
                  name="flame"
                  size={28}
                  color={theme.colors.primary}
                />
              </View>
              <Text style={styles.statValue}>
                {bridgeLoading ? "..." : streak}
              </Text>
              <Text style={styles.statLabel}>Streak</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statIconContainer}>
                <Ionicons
                  name="chatbubbles"
                  size={28}
                  color={theme.colors.primary}
                />
              </View>
              <Text style={styles.statValue}>{totalSessions}</Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
          </Animated.View>

          {/* Level Progress Row */}
          <Animated.View
            entering={FadeInDown.delay(100).duration(400)}
            style={styles.levelProgressRow}
          >
            <View style={styles.levelProgressHeader}>
              <View style={styles.levelPill}>
                <Ionicons
                  name="ribbon-outline"
                  size={11}
                  color={theme.colors.background}
                />
                <Text style={styles.levelPillText}>
                  {bridgeLoading ? "..." : cefrLevel}
                </Text>
              </View>
              <Text style={styles.levelProgressLabel}>
                {bridgeLoading
                  ? "..."
                  : `${fluencyScore ?? 0}% → ${nextCefrLevel(cefrLevel)}`}
              </Text>
            </View>
            <View style={styles.levelProgressTrack}>
              <View
                style={[
                  styles.levelProgressFill,
                  {
                    width: `${Math.min(fluencyScore ?? 0, 100)}%` as any,
                  },
                ]}
              />
            </View>
          </Animated.View>

          {/* Focus Card */}
          <Animated.View
            entering={FadeInDown.delay(140).duration(400)}
            style={styles.focusCard}
          >
            <View style={styles.focusRule} />
            <View style={styles.focusIconWrap}>
              <Ionicons
                name="book-outline"
                size={18}
                color={theme.colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.focusTitle}>{focusTitle}</Text>
              <Text style={styles.focusSubtitle}>{focusSubtitle}</Text>
            </View>
          </Animated.View>

          {/* Primary CTA */}
          <Animated.View entering={FadeInDown.delay(180).duration(400)}>
            <TouchableOpacity
              style={styles.primaryCta}
              activeOpacity={0.85}
              onPress={() => navigation.navigate("EnglivoSessionMode")}
            >
              <View style={styles.primaryCtaContent}>
                <View style={styles.primaryCtaText}>
                  <Text style={styles.primaryCtaTitle}>
                    Practice with AI Tutor
                  </Text>
                  <Text style={styles.primaryCtaSubtitle}>
                    Speak freely. Get instant feedback.
                  </Text>
                </View>
                <View style={styles.primaryCtaIcon}>
                  <Ionicons
                    name="sparkles-outline"
                    size={30}
                    color={theme.colors.primary}
                  />
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* Tutor Card */}
          <Animated.View entering={FadeInDown.delay(220).duration(400)}>
            <TouchableOpacity
              style={styles.tutorCard}
              activeOpacity={0.85}
              onPress={() => navigation.navigate("EnglivoBooking")}
            >
              <View style={styles.tutorCardContent}>
                <View style={styles.tutorIconWrap}>
                  <Ionicons
                    name="person"
                    size={28}
                    color={theme.colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tutorCardTitle}>Book a Human Tutor</Text>
                  <Text style={styles.tutorCardSub}>
                    Schedule a live session with a certified tutor
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.colors.text.light}
                />
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* Next Session */}
          <Animated.View
            entering={FadeInDown.delay(260).duration(400)}
            style={styles.bottomArea}
          >
            <Text style={styles.bottomTitle}>Your next session</Text>
            {upcomingSession ? (
              <View style={styles.upcomingCard}>
                <View style={styles.upcomingContent}>
                  <Ionicons
                    name={
                      upcomingSession.type === "AI"
                        ? "hardware-chip-outline"
                        : "person-outline"
                    }
                    size={24}
                    color={theme.colors.primary}
                  />
                  <View style={styles.upcomingDetails}>
                    <Text style={styles.upcomingTutor}>
                      {upcomingSession.tutorName || "Tutor"}
                    </Text>
                    <Text style={styles.upcomingTime}>
                      {formatSessionTime(upcomingSession.dateTime)}
                    </Text>
                    <View style={styles.upcomingStatusChip}>
                      <Text style={styles.upcomingStatusText}>Scheduled</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity style={styles.joinButton}>
                  <Text style={styles.joinButtonText}>Join</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.noSessionCard}>
                <View style={styles.emptySessionChip}>
                  <Text style={styles.emptySessionChipText}>No booking</Text>
                </View>
                <Text style={styles.noSessionText}>
                  No sessions scheduled yet.
                </Text>
                <TouchableOpacity
                  style={styles.bookSessionBtn}
                  onPress={() => navigation.navigate("EnglivoBooking")}
                  activeOpacity={0.85}
                >
                  <Text style={styles.bookSessionBtnText}>
                    Book a session →
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    safeArea: { flex: 1 },
    scrollView: { flex: 1, backgroundColor: theme.colors.background },
    centered: { justifyContent: "center", alignItems: "center" },
    container: { flex: 1 },

    // Header
    header: {
      paddingHorizontal: theme.spacing.m,
      paddingTop: theme.spacing.m,
      paddingBottom: theme.spacing.m,
      backgroundColor: theme.colors.background,
    },
    headerContent: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerControlsRow: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    modeSwitcherCompact: {
      maxWidth: 164,
      flex: 1,
    },
    greeting: {
      fontSize: theme.typography.sizes.m,
      color: theme.colors.text.light,
      fontWeight: "500",
    },
    name: {
      fontSize: theme.typography.sizes.xxl,
      fontWeight: "800",
      color: theme.colors.text.primary,
      marginTop: 4,
    },
    levelBadge: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 6,
      borderWidth: 1,
      borderColor: `${theme.colors.primary}AA`,
    },
    levelText: {
      color: theme.colors.background,
      fontWeight: "800",
      fontSize: theme.typography.sizes.m,
    },

    // Stats Row
    statsRow: {
      flexDirection: "row",
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.m,
      gap: theme.spacing.s,
    },
    statCard: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: theme.spacing.m,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 5,
      borderWidth: 1,
      borderColor: `${theme.colors.primary}22`,
    },
    statIconContainer: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: `${theme.colors.primary}1F`,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: theme.spacing.s,
    },
    statValue: {
      fontSize: theme.typography.sizes.xl,
      fontWeight: "900",
      color: theme.colors.text.primary,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
      textAlign: "center",
      fontWeight: "600",
    },

    // Level Progress Row
    levelProgressRow: {
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.s,
    },
    levelProgressHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    levelPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    levelPillText: {
      color: theme.colors.background,
      fontSize: theme.typography.sizes.s,
      fontWeight: "800",
    },
    levelProgressLabel: {
      fontSize: 11,
      color: theme.colors.text.light,
      fontWeight: "600",
    },
    levelProgressTrack: {
      height: 6,
      backgroundColor: `${theme.colors.primary}20`,
      borderRadius: 3,
      overflow: "hidden",
    },
    levelProgressFill: {
      height: "100%",
      backgroundColor: theme.colors.primary,
      borderRadius: 3,
    },

    // Focus Card
    focusCard: {
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.m,
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      paddingVertical: theme.spacing.m,
      paddingRight: theme.spacing.m,
      paddingLeft: 0,
      flexDirection: "row",
      alignItems: "flex-start",
      borderWidth: 1,
      borderColor: `${theme.colors.primary}30`,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
      overflow: "hidden",
    },
    focusRule: {
      width: 3,
      borderRadius: 2,
      backgroundColor: theme.colors.primary,
      alignSelf: "stretch",
      marginRight: theme.spacing.s,
    },
    focusIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${theme.colors.primary}1A`,
      marginRight: theme.spacing.s,
    },
    focusTitle: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "800",
      color: theme.colors.text.primary,
      marginBottom: 2,
    },
    focusSubtitle: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
      lineHeight: 18,
      fontWeight: "500",
    },

    // Primary CTA
    primaryCta: {
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.m,
      backgroundColor: theme.colors.primary,
      borderRadius: 20,
      minHeight: 88,
      justifyContent: "center",
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 7 },
      shadowOpacity: 0.28,
      shadowRadius: 14,
      elevation: 10,
      borderWidth: 1,
      borderColor: `${theme.colors.primary}AA`,
    },
    primaryCtaContent: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: theme.spacing.l,
      paddingVertical: theme.spacing.m,
    },
    primaryCtaText: { flex: 1 },
    primaryCtaTitle: {
      fontSize: theme.typography.sizes.xl,
      fontWeight: "900",
      color: theme.colors.background,
      letterSpacing: 0.5,
    },
    primaryCtaSubtitle: {
      fontSize: theme.typography.sizes.m,
      color: `${theme.colors.background}CC`,
      marginTop: 4,
      fontWeight: "500",
    },
    primaryCtaIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: theme.colors.background,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 6,
    },

    // Tutor Card
    tutorCard: {
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.m,
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: theme.spacing.m,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 5,
      borderWidth: 1,
      borderColor: `${theme.colors.primary}40`,
    },
    tutorCardContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.m,
    },
    tutorIconWrap: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: `${theme.colors.primary}1F`,
      justifyContent: "center",
      alignItems: "center",
    },
    tutorCardTitle: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "800",
      color: theme.colors.text.primary,
    },
    tutorCardSub: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
      marginTop: 4,
      fontWeight: "500",
    },

    // Bottom / Next Session
    bottomArea: {
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.l,
    },
    bottomTitle: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "800",
      color: theme.colors.text.primary,
      marginBottom: theme.spacing.m,
    },
    upcomingCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: theme.spacing.m,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 5,
      borderWidth: 1,
      borderColor: `${theme.colors.primary}22`,
    },
    upcomingContent: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    upcomingDetails: { marginLeft: theme.spacing.s, flex: 1 },
    upcomingTutor: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    upcomingTime: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
      fontWeight: "500",
    },
    upcomingStatusChip: {
      marginTop: 6,
      alignSelf: "flex-start",
      backgroundColor: `${theme.colors.primary}1A`,
      borderColor: `${theme.colors.primary}40`,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    upcomingStatusText: {
      color: theme.colors.primary,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
    joinButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: theme.spacing.l,
      paddingVertical: theme.spacing.m,
      borderRadius: 10,
      minWidth: 80,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.24,
      shadowRadius: 6,
      elevation: 4,
    },
    joinButtonText: {
      color: theme.colors.background,
      fontWeight: "800",
      fontSize: theme.typography.sizes.s,
      textAlign: "center",
    },
    noSessionCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: theme.spacing.l,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 5,
      borderWidth: 1,
      borderColor: `${theme.colors.primary}18`,
      alignItems: "center",
    },
    emptySessionChip: {
      alignSelf: "center",
      backgroundColor: `${theme.colors.primary}14`,
      borderColor: `${theme.colors.primary}35`,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginBottom: 8,
    },
    emptySessionChipText: {
      color: theme.colors.primary,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
    noSessionText: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
      textAlign: "center",
      fontWeight: "500",
      marginBottom: theme.spacing.s,
    },
    bookSessionBtn: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: theme.spacing.l,
      paddingVertical: theme.spacing.s,
      borderRadius: 10,
    },
    bookSessionBtnText: {
      color: theme.colors.background,
      fontWeight: "700",
      fontSize: theme.typography.sizes.s,
    },
  });
