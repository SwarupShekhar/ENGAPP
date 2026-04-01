import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useUser } from "@clerk/clerk-expo";
import { useAppTheme } from "../../../theme/useAppTheme";
import { getMe, getHistory } from "../../../api/user";
import { User, SessionHistory } from "../../../types/user";

const { width } = Dimensions.get("window");

export default function HomeScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation<any>();
  const { user: clerkUser } = useUser();

  const [userData, setUserData] = useState<User | null>(null);
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [me, hist] = await Promise.all([getMe(), getHistory()]);
      setUserData(me);
      setHistory(Array.isArray(hist) ? hist : []);
    } catch (e) {
      console.warn("[HomeScreen] Failed to load data:", e);
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

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const firstName =
    userData?.firstName || clerkUser?.firstName || "Learner";
  const cefrLevel = userData?.cefrLevel || "A1";
  const streak = userData?.streakDays || 0;
  const totalSessions = userData?.totalSessions || 0;
  const safeHistory = Array.isArray(history) ? history : [];
  const recentSessions = safeHistory.slice(0, 3);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Header */}
        <LinearGradient
          colors={theme.colors.gradients.surface as any}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.greeting}>Good day,</Text>
              <Text style={styles.name}>{firstName} 👋</Text>
            </View>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>{cefrLevel}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="flame" size={24} color="#F59E0B" />
            <Text style={styles.statValue}>{streak}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="chatbubbles" size={24} color={theme.colors.primary} />
            <Text style={styles.statValue}>{totalSessions}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trophy" size={24} color="#34D399" />
            <Text style={styles.statValue}>{cefrLevel}</Text>
            <Text style={styles.statLabel}>CEFR Level</Text>
          </View>
        </View>

        {/* AI Tutor Hero Card */}
        <TouchableOpacity
          style={styles.heroCard}
          activeOpacity={0.92}
          onPress={() => navigation.navigate("SessionMode")}
        >
          <LinearGradient
            colors={theme.colors.gradients.primary as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroContent}>
              <View>
                <Text style={styles.heroTitle}>Practice with AI Tutor</Text>
                <Text style={styles.heroSubtitle}>
                  Speak freely. Get instant feedback.
                </Text>
              </View>
              <View style={styles.heroIcon}>
                <Ionicons name="mic" size={32} color="#0F172A" />
              </View>
            </View>
            <View style={styles.heroAction}>
              <Text style={styles.heroActionText}>Start Session</Text>
              <Ionicons name="arrow-forward" size={18} color="#0F172A" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Human Tutor Card */}
        <TouchableOpacity
          style={styles.tutorCard}
          activeOpacity={0.92}
          onPress={() => navigation.navigate("Booking")}
        >
          <View style={styles.tutorCardContent}>
            <View style={styles.tutorIconWrap}>
              <Ionicons name="person" size={28} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tutorCardTitle}>Book a Human Tutor</Text>
              <Text style={styles.tutorCardSub}>
                Schedule a live session with a certified tutor
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={theme.colors.text.light}
            />
          </View>
        </TouchableOpacity>

        {/* Daily Goal */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Daily Goal</Text>
        </View>
        <View style={styles.goalCard}>
          <View style={styles.goalRow}>
            <Text style={styles.goalLabel}>Complete 1 session today</Text>
            <Text style={styles.goalValue}>
              {recentSessions.length > 0 ? "Done ✓" : "0 / 1"}
            </Text>
          </View>
          <View style={styles.goalBarBg}>
            <View
              style={[
                styles.goalBarFill,
                { width: `${recentSessions.length > 0 ? 100 : 0}%` },
              ]}
            />
          </View>
        </View>

        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Sessions</Text>
            </View>
            {recentSessions.map((s) => (
              <View key={s.id} style={styles.sessionRow}>
                <Ionicons
                  name={s.type === "AI" ? "hardware-chip-outline" : "person-outline"}
                  size={20}
                  color={theme.colors.primary}
                />
                <View style={{ flex: 1, marginLeft: theme.spacing.s }}>
                  <Text style={styles.sessionType}>
                    {s.type === "AI" ? "AI Tutor" : "Human Tutor"}
                  </Text>
                  <Text style={styles.sessionMeta}>
                    {s.durationMinutes} min
                    {s.cefrLevel ? ` · ${s.cefrLevel}` : ""}
                  </Text>
                </View>
                {s.score !== undefined && (
                  <Text style={styles.sessionScore}>{s.score}%</Text>
                )}
              </View>
            ))}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    centered: { justifyContent: "center", alignItems: "center" },
    header: {
      paddingHorizontal: theme.spacing.m,
      paddingTop: theme.spacing.m,
      paddingBottom: theme.spacing.l,
    },
    headerContent: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    greeting: {
      fontSize: theme.typography.sizes.m,
      color: theme.colors.text.light,
    },
    name: {
      fontSize: theme.typography.sizes.xl,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    levelBadge: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: theme.borderRadius.circle,
    },
    levelText: {
      color: "#0F172A",
      fontWeight: "bold",
      fontSize: theme.typography.sizes.m,
    },
    statsRow: {
      flexDirection: "row",
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.m,
      gap: theme.spacing.s,
    },
    statCard: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.l,
      padding: theme.spacing.m,
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    statValue: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    statLabel: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.light,
      textAlign: "center",
    },
    heroCard: {
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.m,
      borderRadius: theme.borderRadius.xl,
      overflow: "hidden",
      ...theme.shadows.primaryGlow,
    },
    heroGradient: { padding: theme.spacing.l },
    heroContent: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme.spacing.m,
    },
    heroTitle: {
      fontSize: theme.typography.sizes.xl,
      fontWeight: "bold",
      color: "#0F172A",
    },
    heroSubtitle: {
      fontSize: theme.typography.sizes.s,
      color: "#1E293B",
      marginTop: 4,
    },
    heroIcon: {
      width: 60,
      height: 60,
      borderRadius: theme.borderRadius.circle,
      backgroundColor: "rgba(0,0,0,0.15)",
      justifyContent: "center",
      alignItems: "center",
    },
    heroAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.s,
    },
    heroActionText: {
      fontWeight: "bold",
      color: "#0F172A",
      fontSize: theme.typography.sizes.m,
    },
    tutorCard: {
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.m,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.m,
    },
    tutorCardContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.m,
    },
    tutorIconWrap: {
      width: 48,
      height: 48,
      borderRadius: theme.borderRadius.m,
      backgroundColor: `${theme.colors.primary}20`,
      justifyContent: "center",
      alignItems: "center",
    },
    tutorCardTitle: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    tutorCardSub: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.light,
      marginTop: 2,
    },
    sectionHeader: {
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.l,
      marginBottom: theme.spacing.s,
    },
    sectionTitle: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    goalCard: {
      marginHorizontal: theme.spacing.m,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.l,
      padding: theme.spacing.m,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    goalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: theme.spacing.s,
    },
    goalLabel: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.primary,
    },
    goalValue: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.primary,
      fontWeight: "bold",
    },
    goalBarBg: {
      height: 6,
      backgroundColor: theme.colors.border,
      borderRadius: 3,
    },
    goalBarFill: {
      height: 6,
      backgroundColor: theme.colors.primary,
      borderRadius: 3,
    },
    sessionRow: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: theme.spacing.m,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.m,
      padding: theme.spacing.m,
      marginBottom: theme.spacing.s,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    sessionType: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "600",
      color: theme.colors.text.primary,
    },
    sessionMeta: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.light,
    },
    sessionScore: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "bold",
      color: theme.colors.primary,
    },
  });
