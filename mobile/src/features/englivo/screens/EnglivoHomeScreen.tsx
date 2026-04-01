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
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useUser } from "@clerk/clerk-expo";
import { useAppTheme } from "../../../theme/useAppTheme";
import { ModeSwitcher } from "../../../components/navigation/ModeSwitcher";
import { getHistory, getMe } from "../../../api/englivo/user";
import { getBridgeUser } from "../../../api/bridgeClient";
import { getSessionsCount, getUpcomingSession } from "../../../api/englivoClient";
import { SessionHistory, User } from "../../../types/user";

const { width } = Dimensions.get("window");

export default function EnglivoHomeScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation<any>();
  const { user: clerkUser } = useUser();

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

  // Claymorphism animation values
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(24)).current;

  const load = async () => {
    try {
      const [me, hist] = await Promise.all([
        getMe(),
        getHistory(),
      ]);
      setUserData(me);
      setHistory(Array.isArray(hist) ? hist : []);
      if (me?.totalMinutes) setTotalMinutes(me.totalMinutes);

      // Handle API errors gracefully for sessions endpoints
      try {
        const sessionsCnt = await getSessionsCount();
        setSessionsCount(sessionsCnt);
      } catch (error) {
        console.warn('[EnglivoHome] Sessions count error:', error);
        setSessionsCount(0); // Default to 0 on error
      }

      try {
        const upcoming = await getUpcomingSession();
        setUpcomingSession(upcoming);
      } catch (error) {
        console.warn('[EnglivoHome] Upcoming session error:', error);
        setUpcomingSession(null); // Default to null on error
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
          const nextCefr =
            bridgeUser?.cefrLevel ??
            bridgeUser?.cefr_level;
          const nextFluency =
            bridgeUser?.fluencyScore ??
            bridgeUser?.fluency_score;
          const nextStreak =
            bridgeUser?.streakDays ??
            bridgeUser?.streak_days;
          const nextTotalMinutes =
            bridgeUser?.totalPracticeMinutes ??
            bridgeUser?.total_practice_minutes;
          const nextPreferredMode =
            bridgeUser?.preferredMode ??
            bridgeUser?.preferred_mode;

          if (nextCefr) setCefrLevel(nextCefr);
          if (typeof nextFluency === "number") setFluencyScore(nextFluency);
          if (typeof nextStreak === "number") setStreakDays(nextStreak);
          if (typeof nextTotalMinutes === "number") setTotalMinutes(nextTotalMinutes);
          if (typeof nextPreferredMode === "string") setPreferredMode(nextPreferredMode);
        })
        .catch(() => {
          // Keep cached/default values on Bridge fetch failure.
        })
        .finally(() => setBridgeLoading(false));
    }
  }, [clerkUser?.id]);

  // Claymorphism entrance animation
  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [loading]);

  const firstName = userData?.firstName || clerkUser?.firstName || "Learner";
  const streak = streakDays || 0;
  const totalSessions = sessionsCount;
  const effectivePreferredMode = preferredMode ?? "AI";
  const prefersHumanTutor = effectivePreferredMode.toLowerCase().includes("human");
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
        <Animated.View
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View>
                <Text style={styles.greeting}>Your learning hub</Text>
                <Text style={styles.name}>{firstName}</Text>
              </View>
            </View>
            <View style={styles.headerControlsRow}>
              <ModeSwitcher style={styles.modeSwitcherCompact} />
              <View style={styles.levelBadge}>
                <Ionicons name="ribbon-outline" size={14} color="#1A1000" />
                  <Text style={styles.levelText}>
                    {bridgeLoading ? "..." : cefrLevel}
                  </Text>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <View style={styles.statIconContainer}>
                <Ionicons name="flame" size={28} color={theme.colors.primary} />
              </View>
              <Text style={styles.statValue}>{bridgeLoading ? "..." : streak}</Text>
              <Text style={styles.statLabel}>Streak</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statIconContainer}>
                <Ionicons name="chatbubbles" size={28} color={theme.colors.primary} />
              </View>
              <Text style={styles.statValue}>{totalSessions}</Text>
              <Text style={styles.statLabel}>Sessions done</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statIconContainer}>
                <Ionicons name="trophy" size={28} color={theme.colors.primary} />
              </View>
              <Text style={styles.statValue}>{bridgeLoading ? "..." : cefrLevel}</Text>
              <Text style={styles.statLabel}>Current level</Text>
            </View>
          </View>

          <View style={styles.focusCard}>
            <View style={styles.focusIconWrap}>
              <Ionicons name="book-outline" size={18} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.focusTitle}>{focusTitle}</Text>
              <Text style={styles.focusSubtitle}>{focusSubtitle}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryCta}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("EnglivoSessionMode")}
          >
            <View style={styles.primaryCtaContent}>
              <View style={styles.primaryCtaText}>
                <Text style={styles.primaryCtaTitle}>Practice with AI Tutor</Text>
                <Text style={styles.primaryCtaSubtitle}>Speak freely. Get instant feedback.</Text>
              </View>
              <View style={styles.primaryCtaIcon}>
                <Ionicons name="sparkles-outline" size={30} color={theme.colors.background} />
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tutorCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("EnglivoBooking")}
          >
            <View style={styles.tutorCardContent}>
              <View style={styles.tutorIconWrap}>
                <Ionicons name="person" size={28} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tutorCardTitle}>Book a Human Tutor</Text>
                <Text style={styles.tutorCardSub}>Schedule a live session with a certified tutor</Text>
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.bottomArea}>
            <Text style={styles.bottomTitle}>Your next session</Text>
            {upcomingSession ? (
              <View style={styles.upcomingCard}>
                <View style={styles.upcomingContent}>
                  <Ionicons
                    name={upcomingSession.type === "AI" ? "hardware-chip-outline" : "person-outline"}
                    size={24}
                    color={theme.colors.primary}
                  />
                  <View style={styles.upcomingDetails}>
                    <Text style={styles.upcomingTutor}>{upcomingSession.tutorName || "Tutor"}</Text>
                    <Text style={styles.upcomingTime}>{upcomingSession.dateTime}</Text>
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
                <Text style={styles.noSessionText}>No sessions scheduled. Book one above.</Text>
              </View>
            )}
          </View>
        </Animated.View>
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
    header: { paddingHorizontal: theme.spacing.m, paddingTop: theme.spacing.m, paddingBottom: theme.spacing.l, backgroundColor: theme.colors.background },
    headerContent: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    headerControlsRow: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    modeSwitcherCompact: {
      width: 164,
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
    levelText: { color: "#0F172A", fontWeight: "800", fontSize: theme.typography.sizes.m },
    statsRow: { flexDirection: "row", marginHorizontal: theme.spacing.m, marginTop: theme.spacing.m, gap: theme.spacing.s },
    statCard: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: theme.spacing.m,
      alignItems: "center",
      shadowColor: '#000',
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
    primaryCtaContent: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: theme.spacing.l, paddingVertical: theme.spacing.m },
    primaryCtaText: { flex: 1 },
    primaryCtaTitle: { fontSize: theme.typography.sizes.xl, fontWeight: "900", color: "#0F172A", letterSpacing: 0.5 },
    primaryCtaSubtitle: { fontSize: theme.typography.sizes.m, color: "#1E293B", marginTop: 4, fontWeight: "500" },
    primaryCtaIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: "#0F172A",
      justifyContent: "center",
      alignItems: "center",
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 6,
    },
    tutorCard: {
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.m,
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: theme.spacing.m,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 5,
      borderWidth: 1,
      borderColor: `${theme.colors.primary}22`,
    },
    tutorCardContent: { flexDirection: "row", alignItems: "center", gap: theme.spacing.m },
    tutorIconWrap: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: `${theme.colors.primary}1F`,
      justifyContent: "center",
      alignItems: "center",
    },
    tutorCardTitle: { fontSize: theme.typography.sizes.l, fontWeight: "800", color: theme.colors.text.primary },
    tutorCardSub: { fontSize: theme.typography.sizes.s, color: theme.colors.text.light, marginTop: 4, fontWeight: "500" },
    focusCard: {
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.m,
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: theme.spacing.m,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      borderWidth: 1,
      borderColor: `${theme.colors.primary}20`,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    focusIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${theme.colors.primary}1A`,
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
    bottomArea: { marginHorizontal: theme.spacing.m, marginTop: theme.spacing.l },
    bottomTitle: { fontSize: theme.typography.sizes.l, fontWeight: "800", color: theme.colors.text.primary, marginBottom: theme.spacing.m },
    upcomingCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: theme.spacing.m,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 5,
      borderWidth: 1,
      borderColor: `${theme.colors.primary}22`,
    },
    upcomingContent: { flexDirection: "row", alignItems: "center", flex: 1 },
    upcomingDetails: { marginLeft: theme.spacing.s, flex: 1 },
    upcomingTutor: { fontSize: theme.typography.sizes.m, fontWeight: "700", color: theme.colors.text.primary },
    upcomingTime: { fontSize: theme.typography.sizes.s, color: theme.colors.text.light, fontWeight: "500" },
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
    joinButtonText: { color: "#0F172A", fontWeight: "800", fontSize: theme.typography.sizes.s, textAlign: "center" },
    noSessionCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: theme.spacing.l,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 5,
      borderWidth: 1,
      borderColor: `${theme.colors.primary}18`,
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
    noSessionText: { fontSize: theme.typography.sizes.s, color: theme.colors.text.light, textAlign: "center", fontWeight: "500" },
  });
