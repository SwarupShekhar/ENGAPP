import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { tokensV2_603010 as tokensV2 } from "../../../theme/tokensV2_603010";
import { client } from "../../../api/client";
import { tasksApi, type LearningTask } from "../../../api/tasks";

interface ProgressMetricsV2 {
  current: {
    pronunciation: number;
    fluency: number;
    grammar: number;
    vocabulary: number;
    comprehension: number;
    overallScore: number;
    cefrLevel: string;
  };
  deltas: {
    pronunciation: number;
    fluency: number;
    grammar: number;
    vocabulary: number;
    comprehension: number;
    overallScore: number;
  };
  weeklyActivity: number[];
  weaknesses: Array<{
    skill: string;
    severity: "HIGH" | "MEDIUM";
    recommendation: string;
  }>;
  streak: number;
  totalSessions: number;
}

const GlassCard = ({ children, style }: { children: React.ReactNode; style?: any }) => (
  <BlurView intensity={80} tint="dark" style={[styles.glassCard, style]}>
    {children}
  </BlurView>
);

function clampScore(n: number) {
  const x = Number(n);
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(100, x));
}

function getCefrColor(level?: string) {
  const l = (level || "").toUpperCase();
  // V2 palette uses one accent color for emphasis.
  if (l.startsWith("A")) return tokensV2.colors.primaryViolet;
  if (l.startsWith("B")) return tokensV2.colors.primaryViolet;
  if (l.startsWith("C")) return tokensV2.colors.primaryViolet;
  return tokensV2.colors.primaryViolet;
}

function ScoreRingV2({ score, cefrLevel }: { score: number; cefrLevel: string }) {
  const safeScore = clampScore(score);
  const size = 180;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (safeScore / 100) * circumference;

  const badgeColor = getCefrColor(cefrLevel);

  return (
    <View style={styles.ringWrap}>
      <Svg width={size} height={size} accessibilityLabel="Progress score ring">
        <Defs>
          <SvgGradient id="progressRingGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={tokensV2.colors.primaryViolet} />
            <Stop offset="100%" stopColor={tokensV2.colors.accentMint} />
          </SvgGradient>
        </Defs>

        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />

        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#progressRingGradient)"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      <View style={styles.ringCenter}>
        <Text style={styles.ringScore}>{safeScore <= 0 ? "--" : Math.round(safeScore)}</Text>
        <View style={[styles.ringLevelPill, { backgroundColor: badgeColor }]}>
          <Text style={styles.ringLevelText}>{cefrLevel || "--"}</Text>
        </View>
      </View>
    </View>
  );
}

function TrendPillV2({ delta }: { delta: number }) {
  const rounded = Math.round(delta * 10) / 10;
  const isPos = rounded > 0;
  const isNeg = rounded < 0;

  const iconName = isPos ? "trending-up" : isNeg ? "trending-down" : "remove";
  const color = isPos ? tokensV2.colors.primaryViolet : tokensV2.colors.textSecondary;
  const bg =
    // Keep pill calm; accent should land once elsewhere in the card
    "rgba(30,17,40,0.78)";

  return (
    <View style={[styles.trendPill, { backgroundColor: bg, borderColor: bg }]}>
      <Ionicons name={iconName as any} size={14} color={color} />
      <Text style={[styles.trendText, { color }]}>
        {isPos ? "+" : ""}
        {rounded}
      </Text>
    </View>
  );
}

function MetricCardV2({
  title,
  score,
  delta,
}: {
  title: string;
  score: number;
  delta: number;
}) {
  const safeScore = clampScore(score);
  const roundedDelta = Math.round(delta * 10) / 10;
  const positive = roundedDelta > 0;
  const negative = roundedDelta < 0;

  // One-accent-per-card: keep delta badge neutral; the progress bar is the accent.
  const deltaColor = tokensV2.colors.textSecondary;
  const deltaBg = "rgba(255,255,255,0.08)";
  const deltaTextPrefix = positive ? "+" : "";
  const deltaSign = positive ? "↑" : negative ? "↓" : "→";

  return (
    <GlassCard style={styles.metricCard}>
      <View style={styles.metricHeaderRow}>
        <Text style={styles.metricTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={[styles.deltaBadge, { backgroundColor: deltaBg, borderColor: deltaBg }]}>
          <Text style={[styles.deltaText, { color: deltaColor }]}>
            {deltaSign} {deltaTextPrefix}
            {roundedDelta}
          </Text>
        </View>
      </View>

      <Text style={styles.metricScore}>{safeScore}</Text>

      <View style={styles.progressBarBg}>
        <LinearGradient
          colors={tokensV2.gradients.progressBar}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.progressBarFill, { width: `${safeScore}%` }]}
        />
      </View>
    </GlassCard>
  );
}

function WeeklyActivityV2({ data }: { data: number[] }) {
  const safeData = Array.isArray(data) ? data.slice(0, 7) : [];
  const normalized = safeData.length === 7 ? safeData : Array.from({ length: 7 }).map((_, i) => safeData[i] ?? 0);
  const maxVal = Math.max(...normalized, 1);
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <GlassCard style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>Activity</Text>
        <Text style={styles.chartSubtitle}>Last 7 days</Text>
      </View>

      <View style={styles.barsRow}>
        {normalized.map((val, i) => {
          const heightPct = (val / maxVal) * 100;
          return (
            <View key={i} style={styles.barCol}>
              <View style={styles.barWrap}>
                <View style={[styles.barFill, { height: `${heightPct}%` }]} />
              </View>
              <Text style={styles.barLabel}>{labels[i]}</Text>
            </View>
          );
        })}
      </View>
    </GlassCard>
  );
}

function scoreSkillSeverityLabel(severity: "HIGH" | "MEDIUM") {
  return severity === "HIGH" ? "High" : "Medium";
}

export default function ProgressScreenV2() {
  const navigation: any = useNavigation();
  const insets = useSafeAreaInsets();

  const [metrics, setMetrics] = useState<ProgressMetricsV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMetrics = useCallback(async () => {
    try {
      setError(false);
      const response = await client.get("/progress/detailed-metrics");
      setMetrics(response.data);
    } catch (err) {
      console.error("[ProgressV2] Failed to fetch progress metrics:", err);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setLoading(true);
    fetchMetrics();
  }, [fetchMetrics]);

  const startPractice = useCallback(async () => {
    setRefreshing(true);
    try {
      const pendingTasks = await tasksApi.getPendingTasks();
      const task = pendingTasks?.[0] ?? null;

      if (!task) {
        Alert.alert("No practice tasks", "Complete an assessment to generate tasks.");
        return;
      }

      await AsyncStorage.setItem("@home_pending_task_cache", JSON.stringify(task));
      navigation.navigate("PracticeTask", { task });
    } catch (e) {
      console.error("[ProgressV2] Start practice failed:", e);
      Alert.alert("Could not start practice", "Try again in a moment.");
    } finally {
      setRefreshing(false);
    }
  }, [navigation]);

  const weaknessSeverityColor = (severity: "HIGH" | "MEDIUM") =>
    severity === "HIGH" ? "rgba(197,232,77,0.16)" : "rgba(255,255,255,0.10)";

  const weekWeaknesses = metrics?.weaknesses ?? [];

  const ringCefrLevel = metrics?.current?.cefrLevel ?? "--";

  const safeOverallScore = metrics?.current?.overallScore ?? 0;

  const detailPairs = useMemo(
    () => [
      {
        title: "Pronunciation",
        score: metrics?.current?.pronunciation ?? 0,
        delta: metrics?.deltas?.pronunciation ?? 0,
      },
      {
        title: "Fluency",
        score: metrics?.current?.fluency ?? 0,
        delta: metrics?.deltas?.fluency ?? 0,
      },
      {
        title: "Grammar",
        score: metrics?.current?.grammar ?? 0,
        delta: metrics?.deltas?.grammar ?? 0,
      },
      {
        title: "Vocabulary",
        score: metrics?.current?.vocabulary ?? 0,
        delta: metrics?.deltas?.vocabulary ?? 0,
      },
    ],
    [metrics],
  );

  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={tokensV2.colors.primaryViolet} style={{ marginTop: 120 }} />
      </View>
    );
  }

  if (error || !metrics) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={{ alignItems: "center", marginTop: 140, paddingHorizontal: 24 }}>
          <Ionicons name="cloud-offline-outline" size={54} color={tokensV2.colors.textSecondary} />
          <Text style={styles.errorTitle}>Could not load progress</Text>
          <Text style={styles.errorSubtitle}>
            Complete an assessment to see your dashboard
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchMetrics} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const streak = metrics.streak ?? 0;
  const totalSessions = metrics.totalSessions ?? 0;

  return (
    <View style={styles.root}>
      {/* Aurora background */}
      <View style={styles.auroraContainer}>
        <LinearGradient
          colors={["rgba(197,232,77,0.14)", "transparent"] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.auroraLeft}
        />
        <LinearGradient
          colors={["rgba(30,17,40,0.95)", "transparent"] as const}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.auroraRight}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokensV2.colors.primaryViolet} />
        }
      >
        <GlassCard style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Your Progress</Text>
              <Text style={styles.headerSubtitle}>Keep going, you're improving</Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate("Profile")}
              style={styles.profileBtn}
              activeOpacity={0.85}
              accessibilityLabel="Open profile"
            >
              <Ionicons name="person-outline" size={20} color={tokensV2.colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </GlassCard>

        <GlassCard style={styles.overallCard}>
          <View style={styles.overallTopRow}>
            <ScoreRingV2 score={safeOverallScore} cefrLevel={ringCefrLevel} />
            <View style={{ flex: 1, paddingLeft: 12 }}>
              <Text style={styles.overallSectionLabel}>Overall Trend</Text>
              <TrendPillV2 delta={metrics.deltas.overallScore ?? 0} />

              <View style={styles.microStats}>
                <View style={styles.microStat}>
                  <Ionicons name="flame" size={18} color={tokensV2.colors.accentAmber} />
                  <Text style={styles.microStatValue}>{streak}</Text>
                  <Text style={styles.microStatLabel}>Day streak</Text>
                </View>
                <View style={styles.microStat}>
                  <Ionicons name="book" size={18} color={tokensV2.colors.accentMint} />
                  <Text style={styles.microStatValue}>{totalSessions}</Text>
                  <Text style={styles.microStatLabel}>Sessions</Text>
                </View>
              </View>
            </View>
          </View>
        </GlassCard>

        <Text style={styles.sectionLabel}>Detailed Scores</Text>
        <View style={styles.metricsGrid}>
          {detailPairs.map((m) => (
            <MetricCardV2 key={m.title} title={m.title} score={m.score} delta={m.delta} />
          ))}
        </View>

        <WeeklyActivityV2 data={metrics.weeklyActivity ?? []} />

        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Focus Areas</Text>

        <GlassCard style={styles.weaknessCard}>
          <View style={styles.weaknessHeader}>
            <View style={styles.weaknessIconCircle}>
              <Ionicons name="flash" size={16} color={tokensV2.colors.accentMint} />
            </View>
            <Text style={styles.weaknessTitle}>Recommendations for your next sessions</Text>
          </View>

          {weekWeaknesses.length > 0 ? (
            weekWeaknesses.slice(0, 6).map((w, i) => (
              <View key={`${w.skill}-${i}`} style={styles.weaknessItem}>
                <View style={[styles.severityPill, { backgroundColor: weaknessSeverityColor(w.severity) }]}>
                  <Text style={styles.severityText}>
                    {scoreSkillSeverityLabel(w.severity)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.weaknessSkill}>{w.skill}</Text>
                  <Text style={styles.weaknessRec}>{w.recommendation}</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyWeakness}>
              <Text style={styles.emptyWeakTitle}>No focus areas right now</Text>
              <Text style={styles.emptyWeakSub}>Your recent progress looks balanced. Keep practicing!</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.startPracticeBtn}
            onPress={startPractice}
            activeOpacity={0.85}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator color={tokensV2.colors.textPrimary} />
            ) : (
              <LinearGradient
                colors={tokensV2.gradients.callButton as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <View style={styles.startPracticeInner}>
              <Ionicons name="sparkles" size={18} color={tokensV2.colors.textPrimary} />
              <Text style={styles.startPracticeText}>Start Practice</Text>
            </View>
          </TouchableOpacity>
        </GlassCard>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokensV2.colors.background,
  },
  auroraContainer: {
    ...StyleSheet.absoluteFillObject,
    height: 420,
  },
  auroraLeft: {
    position: "absolute",
    left: -100,
    top: -110,
    width: 300,
    height: 300,
    borderRadius: 180,
  },
  auroraRight: {
    position: "absolute",
    right: -110,
    top: -60,
    width: 340,
    height: 340,
    borderRadius: 200,
  },
  scrollContent: {
    paddingTop: 62,
    paddingHorizontal: tokensV2.spacing.m,
    paddingBottom: 120,
  },
  glassCard: {
    borderRadius: tokensV2.borderRadius.l,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  headerCard: {
    padding: 16,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: {
    color: tokensV2.colors.textPrimary,
    fontSize: 26,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: tokensV2.colors.textSecondary,
    marginTop: 4,
  },
  profileBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  overallCard: {
    padding: 16,
    marginBottom: 16,
  },
  overallTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  ringWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  ringCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    width: 180,
    height: 180,
  },
  ringScore: {
    color: tokensV2.colors.textPrimary,
    fontSize: 44,
    fontWeight: "900",
    marginBottom: 6,
  },
  ringLevelPill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ringLevelText: {
    color: tokensV2.colors.textPrimary,
    fontWeight: "800",
    fontSize: 12,
  },
  overallSectionLabel: {
    color: tokensV2.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  trendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  trendText: {
    fontSize: 14,
    fontWeight: "800",
  },
  microStats: {
    flexDirection: "row",
    gap: 10,
  },
  microStat: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  microStatValue: {
    color: tokensV2.colors.textPrimary,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 2,
  },
  microStatLabel: {
    marginTop: 2,
    color: tokensV2.colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  sectionLabel: {
    color: tokensV2.colors.textPrimary,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 18,
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    width: "48%",
    padding: 12,
  },
  metricHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    gap: 10,
  },
  metricTitle: {
    color: tokensV2.colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    maxWidth: 120,
  },
  metricScore: {
    color: tokensV2.colors.textPrimary,
    fontSize: 30,
    fontWeight: "900",
    marginBottom: 10,
  },
  deltaBadge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deltaText: {
    fontWeight: "900",
    fontSize: 12,
  },
  progressBarBg: {
    height: 6,
    width: "100%",
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  chartCard: {
    padding: 16,
    marginBottom: 14,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  chartTitle: {
    color: tokensV2.colors.textPrimary,
    fontSize: 16,
    fontWeight: "900",
  },
  chartSubtitle: {
    color: tokensV2.colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  barsRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  barCol: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  barWrap: {
    width: "100%",
    height: 120,
    justifyContent: "flex-end",
  },
  barFill: {
    width: "100%",
    borderRadius: 10,
    backgroundColor: tokensV2.colors.accentMint,
    opacity: 0.95,
  },
  barLabel: {
    color: tokensV2.colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
  },
  weaknessCard: {
    padding: 16,
    marginBottom: 18,
  },
  weaknessHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  weaknessIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 16,
    borderWidth: 1,
    // Neutral container; accent should be used once in the card (severity pill / CTA)
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  weaknessTitle: {
    color: tokensV2.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    flex: 1,
  },
  weaknessItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
  },
  severityPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  severityText: {
    color: tokensV2.colors.textPrimary,
    fontSize: 11,
    fontWeight: "900",
  },
  weaknessSkill: {
    color: tokensV2.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 2,
  },
  weaknessRec: {
    color: tokensV2.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  startPracticeBtn: {
    marginTop: 12,
    borderRadius: tokensV2.borderRadius.l,
    height: 48,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  startPracticeInner: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  startPracticeText: {
    color: tokensV2.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
  },
  emptyWeakness: {
    paddingVertical: 8,
    alignItems: "center",
  },
  emptyWeakTitle: {
    color: tokensV2.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
  },
  emptyWeakSub: {
    color: tokensV2.colors.textSecondary,
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
    fontWeight: "700",
  },
  errorTitle: {
    color: tokensV2.colors.textPrimary,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 16,
  },
  errorSubtitle: {
    color: tokensV2.colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 20,
    backgroundColor: tokensV2.colors.primaryViolet,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  retryBtnText: {
    color: tokensV2.colors.textPrimary,
    fontWeight: "900",
    fontSize: 14,
  },
});

