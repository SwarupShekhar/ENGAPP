import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
import { useFocusEffect } from "@react-navigation/native";
import { useUser, useAuth } from "@clerk/clerk-expo";
import Animated, { FadeInDown } from "react-native-reanimated";
import { getMe } from "../../../api/englivo/user";
import { getBridgeUser } from "../../../api/bridgeClient";
import { User } from "../../../types/user";

const C = {
  void: "#080C14",
  card: "#111827",
  cardBorder: "#1E2D45",
  goldBright: "#F5C842",
  goldMid: "#E8A020",
  goldDeep: "#B8730A",
  ash: "#8B9AB0",
  ashDark: "#3D4F65",
  white: "#F4F6FA",
  green: "#34D399",
  red: "#F87171",
};

// ─── Initials avatar ───────────────────────────────────────────────────────────
function InitialsCoin({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");

  return (
    <LinearGradient
      colors={[C.goldBright, C.goldMid, C.goldDeep]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={avatar.outer}
    >
      <View style={avatar.inner}>
        <Text style={avatar.initials}>{initials}</Text>
      </View>
    </LinearGradient>
  );
}

const avatar = StyleSheet.create({
  outer: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", shadowColor: C.goldMid, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 8 },
  inner: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#0D1422", alignItems: "center", justifyContent: "center" },
  initials: { fontSize: 22, fontWeight: "800", color: C.goldBright, letterSpacing: 1 },
});

// ─── Info row ─────────────────────────────────────────────────────────────────
function InfoRow({ icon, label, value, last }: { icon: string; label: string; value: string; last?: boolean }) {
  return (
    <View style={[row.wrap, !last && row.border]}>
      <Ionicons name={icon as any} size={16} color={C.ash} style={row.icon} />
      <Text style={row.label}>{label}</Text>
      <Text style={row.value} numberOfLines={1}>{value || "—"}</Text>
    </View>
  );
}

const row = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  border: { borderBottomWidth: 0.5, borderBottomColor: C.cardBorder },
  icon: { marginRight: 12, width: 20 },
  label: { fontSize: 13, color: C.ash, flex: 1 },
  value: { fontSize: 13, color: C.white, fontWeight: "600", maxWidth: "55%", textAlign: "right" },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function EnglivoProfileScreen() {
  const { user: clerkUser } = useUser();
  const { signOut } = useAuth();

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<User | null>(null);
  const [cefrLevel, setCefrLevel] = useState("A1");
  const [streak, setStreak] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [preferredMode, setPreferredMode] = useState("AI");

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const [me] = await Promise.all([getMe()]);
          if (!alive) return;
          setUserData(me);

          if (clerkUser?.id) {
            const b = await getBridgeUser(clerkUser.id).catch(() => null);
            if (!alive || !b) return;
            if (b?.cefrLevel ?? b?.cefr_level) setCefrLevel(b.cefrLevel ?? b.cefr_level);
            if (typeof (b?.streakDays ?? b?.streak_days) === "number") setStreak(b.streakDays ?? b.streak_days);
            if (typeof (b?.totalPracticeMinutes ?? b?.total_practice_minutes) === "number")
              setTotalMinutes(b.totalPracticeMinutes ?? b.total_practice_minutes);
            if (b?.preferredMode ?? b?.preferred_mode) setPreferredMode(b.preferredMode ?? b.preferred_mode);
          }
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => { alive = false; };
    }, [clerkUser?.id]),
  );

  const displayName =
    `${userData?.firstName ?? clerkUser?.firstName ?? ""} ${userData?.lastName ?? clerkUser?.lastName ?? ""}`.trim() ||
    "Learner";
  const email = userData?.email ?? clerkUser?.primaryEmailAddress?.emailAddress ?? "";
  const nativeLang = (userData as any)?.nativeLanguage ?? "Not set";
  const hoursStr = totalMinutes > 0 ? `${(totalMinutes / 60).toFixed(1)}h` : "0h";

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* ── HERO ───────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(0).duration(400)} style={s.hero}>
          <LinearGradient
            colors={["transparent", C.goldMid, "transparent"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.hairline}
          />
          <Text style={s.pageLabel}>YOUR PROFILE</Text>

          <View style={s.heroRow}>
            <InitialsCoin name={displayName} />
            <View style={{ flex: 1, marginLeft: 18 }}>
              <Text style={s.heroName} numberOfLines={1}>{displayName}</Text>
              <Text style={s.heroEmail} numberOfLines={1}>{email}</Text>
              <View style={s.levelPill}>
                <Text style={s.levelPillText}>{cefrLevel}</Text>
                <Text style={s.levelPillSub}> · Englivo</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* ── STATS ──────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={s.statsRow}>
          <View style={s.statBlock}>
            <Text style={s.statValue}>{streak}</Text>
            <Text style={s.statLabel}>day streak</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBlock}>
            <Text style={s.statValue}>{hoursStr}</Text>
            <Text style={s.statLabel}>practiced</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statBlock}>
            <Text style={s.statValue}>{cefrLevel}</Text>
            <Text style={s.statLabel}>CEFR level</Text>
          </View>
        </Animated.View>

        {/* ── ACCOUNT DETAILS ─────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(160).duration(400)} style={s.card}>
          <Text style={s.cardLabel}>ACCOUNT</Text>
          <InfoRow icon="mail-outline"       label="Email"            value={email} />
          <InfoRow icon="language-outline"   label="Native language"  value={nativeLang} />
          <InfoRow icon="ribbon-outline"     label="CEFR level"       value={cefrLevel} />
          <InfoRow icon="sparkles-outline"   label="Preferred mode"   value={preferredMode} last />
        </Animated.View>

        {/* ── SIGN OUT ──────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(240).duration(400)} style={{ paddingHorizontal: 20, marginTop: 8 }}>
          <TouchableOpacity
            style={s.signOutBtn}
            activeOpacity={0.8}
            onPress={() => signOut()}
          >
            <Ionicons name="log-out-outline" size={18} color={C.red} style={{ marginRight: 10 }} />
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </Animated.View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.void },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  hero: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  hairline: { height: 0.75, marginBottom: 20, opacity: 0.5 },
  pageLabel: { fontSize: 10, fontWeight: "700", color: C.ash, letterSpacing: 2, marginBottom: 16 },
  heroRow: { flexDirection: "row", alignItems: "center" },
  heroName: { fontSize: 24, fontWeight: Platform.OS === "ios" ? "800" : "900", color: C.white, letterSpacing: -0.3 },
  heroEmail: { fontSize: 13, color: C.ash, marginTop: 3, marginBottom: 10 },
  levelPill: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: C.card,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 0.5,
    borderColor: `${C.goldMid}60`,
    alignItems: "center",
  },
  levelPillText: { fontSize: 12, fontWeight: "800", color: C.goldBright },
  levelPillSub: { fontSize: 12, color: C.ash },

  statsRow: {
    marginHorizontal: 20, marginBottom: 14,
    backgroundColor: C.card, borderRadius: 16,
    paddingVertical: 20, flexDirection: "row",
    borderWidth: 0.5, borderColor: C.cardBorder,
  },
  statBlock: { flex: 1, alignItems: "center" },
  statDivider: { width: 0.5, height: 36, backgroundColor: C.cardBorder, alignSelf: "center" },
  statValue: { fontSize: 22, fontWeight: Platform.OS === "ios" ? "800" : "900", color: C.white, letterSpacing: -0.3 },
  statLabel: { fontSize: 11, color: C.ash, marginTop: 3, fontWeight: "600" },

  card: {
    marginHorizontal: 20, marginBottom: 14,
    backgroundColor: C.card, borderRadius: 16,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4,
    borderWidth: 0.5, borderColor: C.cardBorder,
  },
  cardLabel: { fontSize: 10, fontWeight: "700", color: C.ash, letterSpacing: 2, marginBottom: 4 },

  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.card,
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 0.5,
    borderColor: `${C.red}40`,
  },
  signOutText: { fontSize: 15, fontWeight: "700", color: C.red },
});
