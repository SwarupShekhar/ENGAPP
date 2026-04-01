/**
 * ENGLIVO CORE — HomeScreen V2
 * Design direction: "Gold Standard"
 *
 * Aesthetic: Editorial luxury. Think Bloomberg Terminal meets a high-end
 * language academy. VOIDblack (#080C14) creates genuine depth.
 * Metallic gold is treated as a *material* — used sparingly, always glowing.
 * Ash gray (#8B9AB0) replaces slate for secondary content.
 * Typography is the hero: large, confident, zero decorative clutter.
 *
 * What's different from V1:
 * - Void black background (deeper than #0F172A)
 * - CEFR rendered as a large glowing coin / medal — not a badge pill
 * - Stats replaced by a horizontal "tape ticker" scroll
 * - AI tutor CTA is a full-bleed card with animated audio waveform bars
 * - Sessions shown as "ticket" cards with torn-edge left accent
 * - Thin hairline gold borders (0.5px) instead of opacity fills
 * - Staggered Reanimated FadeInDown entrance per section
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useUser } from "@clerk/clerk-expo";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useAppTheme } from "../../../theme/useAppTheme";
import { getMe } from "../../../api/englivo/user";
import { getBridgeUser, syncBridgeCefr } from "../../../api/bridgeClient";
import { getSessionsCount, getUpcomingSession } from "../../../api/englivoClient";
import { ModeSwitcher } from "../../../components/navigation/ModeSwitcher";

const { width } = Dimensions.get("window");

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  void: "#080C14",          // deeper background — true void black
  navy: "#0D1422",          // surface background
  card: "#111827",          // card surface
  cardBorder: "#1E2D45",    // card border
  goldBright: "#F5C842",    // highlight stop
  goldMid: "#E8A020",       // primary gold
  goldDeep: "#B8730A",      // shadow stop
  goldGlow: "#F5C84240",    // glow tint
  goldFaint: "#F5C84212",   // very subtle tint
  ash: "#8B9AB0",           // secondary text / inactive
  ashDark: "#3D4F65",       // dividers
  white: "#F4F6FA",         // primary text
  white60: "#F4F6FA99",     // 60% text
  red: "#F87171",
  green: "#34D399",
};

// ─── Waveform (animated bars for AI card) ─────────────────────────────────────
function Waveform() {
  const bars = [0.4, 0.7, 1.0, 0.6, 0.9, 0.5, 0.8, 0.4, 0.65, 0.9, 0.5, 1.0, 0.7, 0.45];
  const anims = bars.map(() => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const v = useSharedValue(1);
    useEffect(() => {
      const delay = Math.random() * 800;
      const duration = 400 + Math.random() * 400;
      setTimeout(() => {
        v.value = withRepeat(
          withSequence(
            withTiming(0.2, { duration }),
            withTiming(1, { duration }),
          ),
          -1,
          true,
        );
      }, delay);
    }, []);
    return v;
  });

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, height: 36 }}>
      {bars.map((baseH, i) => {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const animStyle = useAnimatedStyle(() => ({
          height: 36 * baseH * anims[i].value + 4,
          opacity: 0.5 + anims[i].value * 0.5,
        }));
        return (
          <Animated.View
            key={i}
            style={[
              animStyle,
              {
                width: 3,
                borderRadius: 2,
                backgroundColor: C.void,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

// ─── CEFR Coin ────────────────────────────────────────────────────────────────
function CefrCoin({ level, loading }: { level: string; loading: boolean }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.06, { duration: 1800 }), withTiming(1, { duration: 1800 })),
      -1,
      true,
    );
  }, []);
  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 0.4 + (pulse.value - 1) * 3,
  }));

  return (
    <View style={coin.wrap}>
      <Animated.View style={[coin.glow, glowStyle]} />
      <LinearGradient
        colors={[C.goldBright, C.goldMid, C.goldDeep]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={coin.outer}
      >
        <View style={coin.inner}>
          <Text style={coin.level}>{loading ? "·" : level}</Text>
          <Text style={coin.label}>CEFR</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const coin = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", width: 72, height: 72 },
  glow: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.goldMid,
  },
  outer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.goldMid,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  inner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  level: { fontSize: 16, fontWeight: "900", color: C.goldBright, letterSpacing: 1 },
  label: { fontSize: 8, fontWeight: "700", color: C.ash, letterSpacing: 1.5, marginTop: 1 },
});

// ─── Stat Ticker Item ─────────────────────────────────────────────────────────
function StatTick({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={tick.wrap}>
      <Ionicons name={icon as any} size={16} color={C.goldMid} style={{ marginRight: 6 }} />
      <Text style={tick.value}>{value}</Text>
      <Text style={tick.label}>{label}</Text>
    </View>
  );
}

const tick = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 8,
    borderWidth: 0.5,
    borderColor: C.cardBorder,
  },
  value: { fontSize: 14, fontWeight: "800", color: C.white, marginRight: 5 },
  label: { fontSize: 12, fontWeight: "500", color: C.ash },
});

// ─── Session Ticket Card ──────────────────────────────────────────────────────
function TicketCard({ session }: { session: any }) {
  const timeStr = session?.dateTime ?? session?.time ?? "—";
  const tutor = session?.tutorName ?? "Tutor";
  const type = session?.type === "AI" ? "AI Tutor" : "Human Tutor";

  return (
    <View style={ticket.wrap}>
      {/* Left accent strip */}
      <LinearGradient
        colors={[C.goldBright, C.goldDeep]}
        style={ticket.strip}
      />
      {/* Content */}
      <View style={ticket.content}>
        <View style={{ flex: 1 }}>
          <Text style={ticket.type}>{type}</Text>
          <Text style={ticket.tutor}>{tutor}</Text>
          <Text style={ticket.time}>{timeStr}</Text>
        </View>
        <View style={ticket.statusWrap}>
          <View style={ticket.dot} />
          <Text style={ticket.status}>Confirmed</Text>
        </View>
      </View>
      {/* Right — join btn */}
      <TouchableOpacity style={ticket.joinBtn}>
        <Text style={ticket.joinText}>Join</Text>
      </TouchableOpacity>
    </View>
  );
}

const ticket = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: C.cardBorder,
    marginBottom: 10,
  },
  strip: { width: 4, alignSelf: "stretch" },
  content: { flex: 1, padding: 16, flexDirection: "row", alignItems: "center" },
  type: { fontSize: 11, fontWeight: "700", color: C.goldMid, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
  tutor: { fontSize: 15, fontWeight: "700", color: C.white },
  time: { fontSize: 12, color: C.ash, marginTop: 2 },
  statusWrap: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginRight: 5 },
  status: { fontSize: 11, color: C.green, fontWeight: "600" },
  joinBtn: {
    backgroundColor: C.goldMid,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  joinText: { fontSize: 13, fontWeight: "800", color: C.void },
});

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: C.ash, letterSpacing: 1.5, textTransform: "uppercase" }}>
        {title}
      </Text>
      {action && (
        <TouchableOpacity onPress={onAction}>
          <Text style={{ fontSize: 12, color: C.goldMid, fontWeight: "700" }}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function EnglivoHomeScreenV2() {
  const navigation = useNavigation<any>();
  const { user: clerkUser } = useUser();
  const theme = useAppTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [cefrLevel, setCefrLevel] = useState("A1");
  const [streak, setStreak] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [sessionsCount, setSessionsCount] = useState(0);
  const [upcomingSession, setUpcomingSession] = useState<any | null>(null);

  const load = async () => {
    try {
      const [me] = await Promise.all([getMe()]);
      setFirstName(me?.firstName ?? clerkUser?.firstName ?? "");
      if (me?.totalMinutes) setTotalMinutes(me.totalMinutes);

      // Sync Englivo CEFR level to bridge so Pulse/Core both see it
      if (me?.cefrLevel && clerkUser?.id) {
        syncBridgeCefr({
          clerkId: clerkUser.id,
          cefrLevel: me.cefrLevel,
          source: "englivo",
        }).catch(() => { /* silent — bridge may not be reachable */ });
      }

      try { setSessionsCount(await getSessionsCount()); } catch { /* silent */ }
      try { setUpcomingSession(await getUpcomingSession()); } catch { /* silent */ }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  useEffect(() => {
    if (!clerkUser?.id) return;
    setBridgeLoading(true);
    getBridgeUser(clerkUser.id)
      .then((b) => {
        if (b?.cefrLevel ?? b?.cefr_level) setCefrLevel(b.cefrLevel ?? b.cefr_level);
        if (typeof (b?.streakDays ?? b?.streak_days) === "number") setStreak(b.streakDays ?? b.streak_days);
        if (typeof (b?.totalPracticeMinutes ?? b?.total_practice_minutes) === "number")
          setTotalMinutes(b.totalPracticeMinutes ?? b.total_practice_minutes);
      })
      .catch(() => {})
      .finally(() => setBridgeLoading(false));
  }, [clerkUser?.id]);

  const displayName = firstName || clerkUser?.firstName || "Learner";

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={C.goldMid}
          />
        }
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        {/* ── HERO ─────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(0).duration(500)} style={s.hero}>
          {/* Hairline gold separator at top */}
          <LinearGradient
            colors={["transparent", C.goldMid, "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.hairline}
          />

          <View style={s.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.heroLabel}>YOUR LEARNING HUB</Text>
              <Text style={s.heroName} numberOfLines={1}>{displayName}</Text>
              <ModeSwitcher style={{ marginTop: 12, width: 160 }} />
            </View>
            <CefrCoin level={cefrLevel} loading={bridgeLoading} />
          </View>
        </Animated.View>

        {/* ── STAT TICKER ──────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 4 }}
          >
            <StatTick icon="flame" value={`${streak}d`} label="streak" />
            <StatTick icon="chatbubbles-outline" value={`${sessionsCount}`} label="sessions" />
            <StatTick icon="time-outline" value={`${totalMinutes}m`} label="practiced" />
            <StatTick icon="ribbon-outline" value={cefrLevel} label="level" />
          </ScrollView>
        </Animated.View>

        {/* ── AI TUTOR HERO CARD ────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(160).duration(500)} style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => navigation.navigate("EnglivoAiConversation")}
          >
            <LinearGradient
              colors={[C.goldBright, C.goldMid, C.goldDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.aiCard}
            >
              {/* Decorative circle */}
              <View style={s.aiCardCircle} />

              <View style={s.aiCardTop}>
                <View style={s.aiCardBadge}>
                  <Text style={s.aiCardBadgeText}>INSTANT</Text>
                </View>
              </View>

              <Text style={s.aiCardTitle}>Practice with{"\n"}AI Tutor</Text>
              <Text style={s.aiCardSub}>Speak freely · Get real feedback</Text>

              <View style={s.aiCardBottom}>
                <Waveform />
                <View style={s.aiCardArrow}>
                  <Ionicons name="arrow-forward" size={20} color={C.goldDeep} />
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* ── QUICK ACTIONS ─────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(240).duration(500)} style={s.quickRow}>
          {/* Book Tutor */}
          <TouchableOpacity
            style={s.quickCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("EnglivoSessions")}
          >
            <View style={s.quickIconRing}>
              <Ionicons name="person" size={22} color={C.goldMid} />
            </View>
            <Text style={s.quickTitle}>Book Tutor</Text>
            <Text style={s.quickSub}>Live session</Text>
            <Ionicons name="chevron-forward" size={14} color={C.ash} style={{ marginTop: 8 }} />
          </TouchableOpacity>

          {/* Progress */}
          <TouchableOpacity
            style={s.quickCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("Progress")}
          >
            <View style={s.quickIconRing}>
              <Ionicons name="bar-chart" size={22} color={C.goldMid} />
            </View>
            <Text style={s.quickTitle}>Progress</Text>
            <Text style={s.quickSub}>View insights</Text>
            <Ionicons name="chevron-forward" size={14} color={C.ash} style={{ marginTop: 8 }} />
          </TouchableOpacity>

          {/* Profile */}
          <TouchableOpacity
            style={s.quickCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("Profile")}
          >
            <View style={s.quickIconRing}>
              <Ionicons name="person-circle-outline" size={22} color={C.goldMid} />
            </View>
            <Text style={s.quickTitle}>Profile</Text>
            <Text style={s.quickSub}>Settings</Text>
            <Ionicons name="chevron-forward" size={14} color={C.ash} style={{ marginTop: 8 }} />
          </TouchableOpacity>
        </Animated.View>

        {/* ── UPCOMING SESSIONS ─────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(320).duration(500)} style={s.section}>
          <SectionHead
            title="Next Session"
            action="See all"
            onAction={() => navigation.navigate("EnglivoSessions")}
          />
          {upcomingSession ? (
            <TicketCard session={upcomingSession} />
          ) : (
            <View style={s.emptyTicket}>
              <Ionicons name="calendar-outline" size={24} color={C.ashDark} style={{ marginBottom: 8 }} />
              <Text style={s.emptyText}>No upcoming sessions.</Text>
              <TouchableOpacity
                style={s.emptyBtn}
                onPress={() => navigation.navigate("EnglivoSessions")}
              >
                <Text style={s.emptyBtnText}>Book one now</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>

        {/* ── FOCUS PROMPT ──────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(400).duration(500)} style={s.section}>
          <SectionHead title="Today's Focus" />
          <View style={s.focusCard}>
            {/* vertical gold rule */}
            <View style={s.focusRule} />
            <View style={{ flex: 1, paddingLeft: 14 }}>
              <Text style={s.focusTitle}>
                {streak >= 5
                  ? "Momentum is strong"
                  : sessionsCount > 0
                    ? "Keep your rhythm"
                    : "Start your streak"}
              </Text>
              <Text style={s.focusSub}>
                {streak >= 5
                  ? "You're consistent. Push a focused speaking drill today."
                  : sessionsCount > 0
                    ? "A short AI session will keep your speaking habit alive."
                    : "Take your first guided speaking session and build momentum."}
              </Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.void },

  // Hero
  hero: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  hairline: { height: 0.75, marginBottom: 20, opacity: 0.6 },
  heroRow: { flexDirection: "row", alignItems: "center" },
  heroLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: C.ash,
    letterSpacing: 2,
    marginBottom: 6,
  },
  heroName: {
    fontSize: 34,
    fontWeight: Platform.OS === "ios" ? "800" : "900",
    color: C.white,
    letterSpacing: -0.5,
  },

  // AI card
  aiCard: {
    borderRadius: 20,
    padding: 24,
    minHeight: 200,
    overflow: "hidden",
    shadowColor: C.goldMid,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  aiCardCircle: {
    position: "absolute",
    right: -40,
    top: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  aiCardTop: { flexDirection: "row", marginBottom: 16 },
  aiCardBadge: {
    backgroundColor: C.void,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  aiCardBadgeText: { fontSize: 10, fontWeight: "800", color: C.goldBright, letterSpacing: 1.5 },
  aiCardTitle: {
    fontSize: 30,
    fontWeight: Platform.OS === "ios" ? "800" : "900",
    color: C.void,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  aiCardSub: { fontSize: 14, color: C.void, opacity: 0.6, marginBottom: 20 },
  aiCardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  aiCardArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Quick actions
  quickRow: { flexDirection: "row", paddingHorizontal: 20, marginTop: 16, gap: 10 },
  quickCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 0.5,
    borderColor: C.cardBorder,
  },
  quickIconRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.goldFaint,
    borderWidth: 0.5,
    borderColor: `${C.goldMid}50`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  quickTitle: { fontSize: 13, fontWeight: "700", color: C.white },
  quickSub: { fontSize: 11, color: C.ash, marginTop: 2 },

  // Sections
  section: { paddingHorizontal: 20, marginTop: 24 },

  // Empty ticket
  emptyTicket: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: C.cardBorder,
  },
  emptyText: { fontSize: 14, color: C.ash, marginBottom: 14 },
  emptyBtn: {
    backgroundColor: C.goldMid,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyBtnText: { fontSize: 13, fontWeight: "800", color: C.void },

  // Focus card
  focusCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 0.5,
    borderColor: C.cardBorder,
  },
  focusRule: {
    width: 3,
    borderRadius: 2,
    backgroundColor: C.goldMid,
    alignSelf: "stretch",
    minHeight: 50,
  },
  focusTitle: { fontSize: 16, fontWeight: "700", color: C.white, marginBottom: 6 },
  focusSub: { fontSize: 13, color: C.ash, lineHeight: 20 },
});
