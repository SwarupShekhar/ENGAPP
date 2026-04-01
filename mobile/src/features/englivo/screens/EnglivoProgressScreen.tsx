import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useUser } from "@clerk/clerk-expo";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { getBridgeUser } from "../../../api/bridgeClient";
import { getPerformanceHistory } from "../../../api/englivo/progress";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  void: "#080C14",
  card: "#111827",
  cardBorder: "#1E2D45",
  goldBright: "#F5C842",
  goldMid: "#E8A020",
  goldDeep: "#B8730A",
  goldFaint: "#F5C84210",
  ash: "#8B9AB0",
  ashDark: "#3D4F65",
  white: "#F4F6FA",
  green: "#34D399",
  blue: "#60A5FA",
  red: "#F87171",
  purple: "#A78BFA",
};

// ─── Skill bar with animated fill ─────────────────────────────────────────────
function SkillBar({
  label,
  score,
  color,
  icon,
  delay,
}: {
  label: string;
  score: number; // 0–100
  color: string;
  icon: string;
  delay: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      progress.value = withTiming(score / 100, { duration: 900 });
    }, delay);
    return () => clearTimeout(timer);
  }, [score]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%` as any,
  }));

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(400)} style={bar.wrap}>
      <View style={bar.row}>
        <View style={bar.labelRow}>
          <Ionicons name={icon as any} size={14} color={color} style={{ marginRight: 6 }} />
          <Text style={bar.label}>{label}</Text>
        </View>
        <Text style={[bar.score, { color }]}>{score}</Text>
      </View>
      <View style={bar.track}>
        <Animated.View style={[bar.fill, barStyle, { backgroundColor: color }]} />
      </View>
    </Animated.View>
  );
}

const bar = StyleSheet.create({
  wrap: { marginBottom: 18 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
  labelRow: { flexDirection: "row", alignItems: "center" },
  label: { fontSize: 13, fontWeight: "600", color: C.ash },
  score: { fontSize: 13, fontWeight: "800" },
  track: { height: 5, borderRadius: 3, backgroundColor: C.cardBorder, overflow: "hidden" },
  fill: { height: 5, borderRadius: 3 },
});

// ─── Stat block ───────────────────────────────────────────────────────────────
function StatBlock({ icon, value, label, color }: { icon: string; value: string; label: string; color?: string }) {
  return (
    <View style={stat.wrap}>
      <View style={[stat.iconRing, { borderColor: `${color ?? C.goldMid}40` }]}>
        <Ionicons name={icon as any} size={20} color={color ?? C.goldMid} />
      </View>
      <Text style={stat.value}>{value}</Text>
      <Text style={stat.label}>{label}</Text>
    </View>
  );
}

const stat = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center" },
  iconRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  value: { fontSize: 20, fontWeight: Platform.OS === "ios" ? "800" : "900", color: C.white, letterSpacing: -0.3 },
  label: { fontSize: 11, color: C.ash, marginTop: 2, fontWeight: "600" },
});

// ─── CEFR arc indicator ────────────────────────────────────────────────────────
const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

function CefrArc({ level }: { level: string }) {
  const idx = CEFR_ORDER.indexOf(level);
  const pct = idx < 0 ? 0 : idx / (CEFR_ORDER.length - 1);
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(pct, { duration: 1200 });
  }, [pct]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%` as any,
  }));

  return (
    <View style={arc.wrap}>
      <LinearGradient
        colors={[C.goldBright, C.goldMid, C.goldDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={arc.coin}
      >
        <View style={arc.coinInner}>
          <Text style={arc.level}>{level}</Text>
          <Text style={arc.cefrLabel}>CEFR</Text>
        </View>
      </LinearGradient>
      <View style={{ flex: 1, marginLeft: 20, justifyContent: "center" }}>
        <Text style={arc.roadmapLabel}>Level Progress</Text>
        {/* Track */}
        <View style={arc.track}>
          <Animated.View style={[arc.trackFill, fillStyle]} />
          {/* Pip markers */}
          {CEFR_ORDER.map((l, i) => {
            const pos = (i / (CEFR_ORDER.length - 1)) * 100;
            const reached = i <= idx;
            return (
              <View
                key={l}
                style={[
                  arc.pip,
                  { left: `${pos}%` as any },
                  reached ? { backgroundColor: C.goldMid } : { backgroundColor: C.ashDark },
                ]}
              />
            );
          })}
        </View>
        {/* Labels */}
        <View style={arc.labelRow}>
          {CEFR_ORDER.map((l) => (
            <Text key={l} style={[arc.pip_label, l === level && { color: C.goldBright, fontWeight: "800" }]}>
              {l}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const arc = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center" },
  coin: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
    shadowColor: C.goldMid, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6,
  },
  coinInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#0D1422", alignItems: "center", justifyContent: "center" },
  level: { fontSize: 16, fontWeight: "900", color: C.goldBright, letterSpacing: 1 },
  cefrLabel: { fontSize: 8, color: C.ash, letterSpacing: 1.5, fontWeight: "700" },
  roadmapLabel: { fontSize: 11, color: C.ash, fontWeight: "600", letterSpacing: 0.8, marginBottom: 10 },
  track: { height: 4, backgroundColor: C.cardBorder, borderRadius: 2, overflow: "visible", position: "relative" },
  trackFill: { height: 4, backgroundColor: C.goldMid, borderRadius: 2 },
  pip: { position: "absolute", top: -3, width: 10, height: 10, borderRadius: 5, marginLeft: -5 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  pip_label: { fontSize: 10, color: C.ash, fontWeight: "600" },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function EnglivoProgressScreen() {
  const { user: clerkUser } = useUser();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [streak, setStreak] = useState(0);
  const [totalHours, setTotalHours] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [cefrLevel, setCefrLevel] = useState("A1");
  const [skills, setSkills] = useState({ pronunciation: 0, grammar: 0, fluency: 0, vocabulary: 0 });

  const load = async () => {
    try {
      const [perf] = await Promise.all([getPerformanceHistory()]);
      setStreak(perf.streak ?? 0);
      setTotalHours(perf.totalHours ?? 0);
      setTotalSessions((perf as any).totalSessions ?? 0);

      if (clerkUser?.id) {
        const b = await getBridgeUser(clerkUser.id).catch(() => null);
        if (b?.cefrLevel ?? b?.cefr_level) setCefrLevel(b.cefrLevel ?? b.cefr_level);
        if (b?.streakDays ?? b?.streak_days) setStreak(b.streakDays ?? b.streak_days);
        if (b?.weaknesses) {
          setSkills({
            pronunciation: Math.round(100 - (b.weaknesses.pronunciation ?? 0) * 100),
            grammar: Math.round(100 - (b.weaknesses.grammar ?? 0) * 100),
            fluency: Math.round(100 - (b.weaknesses.fluency ?? 0) * 100),
            vocabulary: Math.round(100 - (b.weaknesses.vocabulary ?? 0) * 100),
          });
        } else {
          // derive rough scores from CEFR
          const idx = CEFR_ORDER.indexOf(cefrLevel);
          const base = idx < 0 ? 30 : 30 + idx * 12;
          setSkills({ pronunciation: base, grammar: base + 5, fluency: base - 5, vocabulary: base + 8 });
        }
      }
    } catch {
      // silent — show defaults
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [clerkUser?.id]));

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.centered}>
          <ActivityIndicator color={C.goldMid} />
        </View>
      </SafeAreaView>
    );
  }

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
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(0).duration(400)} style={s.header}>
          <LinearGradient
            colors={["transparent", C.goldMid, "transparent"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.hairline}
          />
          <Text style={s.pageLabel}>YOUR PROGRESS</Text>
          <Text style={s.pageTitle}>Insights</Text>
        </Animated.View>

        {/* CEFR arc */}
        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={s.card}>
          <Text style={s.cardLabel}>CURRENT LEVEL</Text>
          <CefrArc level={cefrLevel} />
        </Animated.View>

        {/* Stats row */}
        <Animated.View entering={FadeInDown.delay(160).duration(400)} style={s.statsRow}>
          <StatBlock icon="flame" value={`${streak}`} label="day streak" color={C.goldMid} />
          <View style={s.divider} />
          <StatBlock icon="chatbubbles-outline" value={`${totalSessions}`} label="sessions" color={C.blue} />
          <View style={s.divider} />
          <StatBlock icon="time-outline" value={`${totalHours.toFixed(1)}h`} label="practiced" color={C.green} />
        </Animated.View>

        {/* Skill breakdown */}
        <Animated.View entering={FadeInDown.delay(240).duration(400)} style={s.card}>
          <Text style={s.cardLabel}>SKILL BREAKDOWN</Text>
          <SkillBar label="Pronunciation" score={skills.pronunciation} color={C.goldMid}   icon="mic-outline"       delay={300} />
          <SkillBar label="Grammar"       score={skills.grammar}       color={C.blue}      icon="book-outline"      delay={380} />
          <SkillBar label="Fluency"       score={skills.fluency}       color={C.green}     icon="speedometer-outline" delay={460} />
          <SkillBar label="Vocabulary"    score={skills.vocabulary}    color={C.purple}    icon="text-outline"      delay={540} />
        </Animated.View>

        {/* Motivational nudge */}
        <Animated.View entering={FadeInDown.delay(320).duration(400)} style={s.nudgeCard}>
          <View style={s.nudgeRule} />
          <View style={{ flex: 1, paddingLeft: 14 }}>
            <Text style={s.nudgeTitle}>
              {streak >= 7 ? "Remarkable consistency" : streak >= 3 ? "Building momentum" : "Start your streak"}
            </Text>
            <Text style={s.nudgeSub}>
              {streak >= 7
                ? `${streak} days in a row. Keep it up — consistency is your edge.`
                : streak >= 3
                  ? `${streak} days strong. A daily session compounds fast.`
                  : "One session a day rewires how you speak English."}
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.void },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  hairline: { height: 0.75, marginBottom: 20, opacity: 0.5 },
  pageLabel: { fontSize: 10, fontWeight: "700", color: C.ash, letterSpacing: 2, marginBottom: 4 },
  pageTitle: { fontSize: 34, fontWeight: Platform.OS === "ios" ? "800" : "900", color: C.white, letterSpacing: -0.5 },

  card: { marginHorizontal: 20, marginBottom: 14, backgroundColor: C.card, borderRadius: 16, padding: 20, borderWidth: 0.5, borderColor: C.cardBorder },
  cardLabel: { fontSize: 10, fontWeight: "700", color: C.ash, letterSpacing: 2, marginBottom: 16 },

  statsRow: {
    marginHorizontal: 20, marginBottom: 14,
    backgroundColor: C.card, borderRadius: 16, padding: 20,
    flexDirection: "row", alignItems: "center",
    borderWidth: 0.5, borderColor: C.cardBorder,
  },
  divider: { width: 0.5, height: 44, backgroundColor: C.cardBorder, marginHorizontal: 4 },

  nudgeCard: {
    marginHorizontal: 20, marginBottom: 14,
    backgroundColor: C.card, borderRadius: 16, padding: 20,
    flexDirection: "row", alignItems: "flex-start",
    borderWidth: 0.5, borderColor: C.cardBorder,
  },
  nudgeRule: { width: 3, borderRadius: 2, backgroundColor: C.goldMid, alignSelf: "stretch", minHeight: 44 },
  nudgeTitle: { fontSize: 15, fontWeight: "700", color: C.white, marginBottom: 5 },
  nudgeSub: { fontSize: 13, color: C.ash, lineHeight: 19 },
});
