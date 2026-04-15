import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useUser } from "@clerk/clerk-expo";

import { tokensV2_603010 as tokensV2 } from "../../../theme/tokensV2_603010";
import { ConversationSession, sessionsApi } from "../../../api/sessions";

type FeedbackSessionCard = {
  id: string;
  partnerName: string;
  topic: string;
  dateLabel: string;
  durationLabel: string;
  durationSeconds: number;
  overall: number;
  grammar: number;
  fluency: number;
  vocabulary: number;
  pronunciation: number;
};

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "0m";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins <= 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function mapSessionToCard(
  session: ConversationSession,
  currentClerkId?: string,
): FeedbackSessionCard {
  const analysis = session.analyses?.[0];
  const summary = session.summaryJson;
  const scores = analysis?.scores;

  const partner =
    session.participants?.find((p) => p.user?.clerkId && p.user.clerkId !== currentClerkId) ||
    session.participants?.find((p) => p.user) ||
    null;

  const partnerName = partner?.user
    ? `${partner.user.fname || ""} ${partner.user.lname || ""}`.trim() || "Partner"
    : "AI Tutor";

  return {
    id: session.id,
    partnerName,
    topic: session.topic || "General Conversation",
    dateLabel: formatDate(session.startedAt),
    durationLabel: formatDuration(session.duration),
    durationSeconds: session.duration ?? 0,
    overall: Math.round(summary?.overall_score ?? scores?.overall ?? scores?.overall_score ?? 0),
    grammar: Math.round(summary?.grammar_score ?? scores?.grammar ?? scores?.grammar_score ?? 0),
    fluency: Math.round(summary?.fluency_score ?? scores?.fluency ?? scores?.fluency_score ?? 0),
    vocabulary: Math.round(
      summary?.vocabulary_score ?? scores?.vocabulary ?? scores?.vocabulary_score ?? 0,
    ),
    pronunciation: Math.round(
      summary?.pronunciation_score ??
        scores?.pronunciation ??
        scores?.pronunciation_score ??
        0,
    ),
  };
}

const GlassCard = ({ children, style }: { children: React.ReactNode; style?: any }) => (
  <BlurView intensity={70} tint="dark" style={[styles.glassCard, style]}>
    {children}
  </BlurView>
);

export default function FeedbackScreenV2() {
  const navigation: any = useNavigation();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessions, setSessions] = useState<FeedbackSessionCard[]>([]);

  const fetchSessions = useCallback(async () => {
    try {
      const raw = await sessionsApi.listSessions();
      const mapped = raw.map((s) => mapSessionToCard(s, user?.id));
      mapped.sort((a, b) => (a.dateLabel > b.dateLabel ? -1 : 1));
      setSessions(mapped);
    } catch (e) {
      console.warn("[FeedbackV2] Failed to fetch sessions", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchSessions();
    }, [fetchSessions]),
  );

  const stats = useMemo(() => {
    const totalSessions = sessions.length;
    const totalMinutes = Math.floor(
      sessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60,
    );
    const valid = sessions.filter((s) => s.overall > 0);
    const avg = valid.length
      ? Math.round(valid.reduce((acc, s) => acc + s.overall, 0) / valid.length)
      : 0;
    const best = valid.length ? Math.max(...valid.map((s) => s.overall)) : 0;
    return { totalSessions, totalMinutes, avg, best };
  }, [sessions]);

  return (
    <View style={styles.root}>
      <View style={styles.auroraContainer}>
        <LinearGradient
          colors={["rgba(197,232,77,0.16)", "transparent"] as const}
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchSessions();
            }}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <GlassCard style={styles.headerCard}>
          <Text style={styles.headerTitle}>Feedback</Text>
          <Text style={styles.headerSubtitle}>Real post-call analysis</Text>
        </GlassCard>

        <View style={styles.statsRow}>
          <GlassCard style={styles.statCard}>
            <Text style={styles.statValue}>{stats.totalSessions}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </GlassCard>
          <GlassCard style={styles.statCard}>
            <Text style={styles.statValue}>{stats.avg}</Text>
            <Text style={styles.statLabel}>Avg Score</Text>
          </GlassCard>
          <GlassCard style={styles.statCard}>
            <Text style={styles.statValue}>{stats.best}</Text>
            <Text style={styles.statLabel}>Best</Text>
          </GlassCard>
        </View>

        {loading ? (
          <ActivityIndicator color={tokensV2.colors.primaryViolet} style={{ marginTop: 40 }} />
        ) : sessions.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No sessions yet</Text>
            <Text style={styles.emptySubtitle}>
              Complete a call and your real feedback will appear here.
            </Text>
          </GlassCard>
        ) : (
          sessions.map((session) => (
            <TouchableOpacity
              key={session.id}
              style={styles.sessionPressable}
              activeOpacity={0.88}
              onPress={() => {
                navigation.navigate("CallFeedback", {
                  sessionId: session.id,
                  partnerName: session.partnerName,
                  topic: session.topic,
                  duration: session.durationSeconds,
                });
              }}
            >
              <GlassCard style={styles.sessionCard}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.partnerName} numberOfLines={1}>
                      {session.partnerName}
                    </Text>
                    <Text style={styles.topicText} numberOfLines={1}>
                      {session.topic}
                    </Text>
                  </View>
                  <View style={styles.scorePill}>
                    <Text style={styles.scoreText}>{session.overall}</Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>{session.dateLabel}</Text>
                  <Text style={styles.metaDot}>•</Text>
                  <Text style={styles.metaText}>{session.durationLabel}</Text>
                </View>

                <View style={styles.metricRow}>
                  <Text style={styles.metricText}>G {session.grammar}</Text>
                  <Text style={styles.metricText}>F {session.fluency}</Text>
                  <Text style={styles.metricText}>V {session.vocabulary}</Text>
                  <Text style={styles.metricText}>P {session.pronunciation}</Text>
                </View>
              </GlassCard>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 100 }} />
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
  headerTitle: {
    color: tokensV2.colors.textPrimary,
    fontSize: 26,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: tokensV2.colors.textSecondary,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  statValue: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
  },
  statLabel: {
    color: tokensV2.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  emptyCard: {
    padding: 18,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  emptySubtitle: {
    color: tokensV2.colors.textSecondary,
    marginTop: 4,
  },
  sessionPressable: {
    marginBottom: 10,
  },
  sessionCard: {
    padding: 14,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  partnerName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  topicText: {
    color: tokensV2.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  scorePill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(197,232,77,0.16)",
    borderWidth: 1,
    // One-accent-per-card: keep border neutral, let fill be the accent
    borderColor: "rgba(255,255,255,0.12)",
  },
  scoreText: {
    color: "#fff",
    fontWeight: "800",
  },
  metaRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaText: {
    color: tokensV2.colors.textMuted,
    fontSize: 11,
  },
  metaDot: {
    color: tokensV2.colors.textMuted,
    fontSize: 11,
  },
  metricRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metricText: {
    color: tokensV2.colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    height: "85%",
    backgroundColor: tokensV2.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    overflow: "hidden",
  },
  modalAuroraTop: {
    position: "absolute",
    top: -60,
    left: -80,
    width: 280,
    height: 220,
    borderRadius: 140,
  },
  modalHandle: {
    width: 42,
    height: 4,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center",
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  modalSubtitle: {
    color: tokensV2.colors.textSecondary,
    marginTop: 2,
  },
  fullReportBtn: {
    borderRadius: 10,
    borderWidth: 1,
    // One-accent-per-card: neutral border, accent fill is enough
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(197,232,77,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fullReportBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  detailScoreRow: {
    marginTop: 12,
    marginBottom: 4,
  },
  detailOverall: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
  },
  detailPillWrap: {
    marginTop: 6,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  detailPill: {
    color: tokensV2.colors.textPrimary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.05)",
    fontSize: 12,
    fontWeight: "700",
  },
  tabRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  tabBtn: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tabBtnActive: {
    backgroundColor: "rgba(197,232,77,0.16)",
    borderColor: "rgba(197,232,77,0.35)",
  },
  tabBtnText: {
    color: tokensV2.colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  tabBtnTextActive: {
    color: "#fff",
  },
  detailCard: {
    padding: 12,
    marginBottom: 8,
  },
  detailCardStrong: {
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  detailCardTitle: {
    color: "#fff",
    fontWeight: "700",
    marginBottom: 6,
  },
  detailText: {
    color: tokensV2.colors.textSecondary,
    lineHeight: 18,
  },
  detailBullet: {
    color: tokensV2.colors.textSecondary,
    marginBottom: 4,
  },
  mistakeWrong: {
    color: "#fda4af",
    fontWeight: "700",
    marginBottom: 6,
  },
  mistakeRight: {
    color: "#86efac",
    fontWeight: "700",
    marginBottom: 6,
  },
  emptyTabText: {
    color: tokensV2.colors.textSecondary,
    marginTop: 18,
  },
});
