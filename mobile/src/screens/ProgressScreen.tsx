import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  TouchableOpacity,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { MetricCard } from "../components/progress/MetricCard";
import { ProgressRing } from "../components/progress/ProgressRing";
import { TrendIndicator } from "../components/progress/TrendIndicator";
import { MiniChart } from "../components/progress/MiniChart";
import { Ionicons } from "@expo/vector-icons";
import { client } from "../api/client";
import { useNavigation } from "@react-navigation/native";

interface ProgressMetrics {
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

export default function ProgressScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [metrics, setMetrics] = useState<ProgressMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMetrics = async () => {
    try {
      setError(false);
      const response = await client.get("/progress/detailed-metrics");
      setMetrics(response.data);
    } catch (err) {
      console.error("Failed to fetch progress metrics:", err);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={theme.colors.accent} />
        <Text
          style={{
            color: theme.colors.text.secondary,
            marginTop: 12,
            fontSize: 14,
          }}
        >
          Loading your progress...
        </Text>
      </View>
    );
  }

  if (error || !metrics) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <Ionicons
          name="cloud-offline-outline"
          size={48}
          color={theme.colors.text.secondary}
        />
        <Text
          style={{
            color: theme.colors.text.primary,
            marginTop: 16,
            fontSize: 18,
            fontWeight: "700",
          }}
        >
          Could not load progress
        </Text>
        <Text
          style={{
            color: theme.colors.text.secondary,
            marginTop: 4,
            fontSize: 14,
          }}
        >
          Complete an assessment to see your dashboard
        </Text>
        <TouchableOpacity
          onPress={fetchMetrics}
          style={{
            marginTop: 20,
            backgroundColor: theme.colors.accent,
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <StatusBar
        barStyle={theme.variation === "deep" ? "light-content" : "dark-content"}
      />
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        {/* Header with Profile button */}
        <View style={styles.headerBar}>
          <View>
            <Text
              style={[styles.greeting, { color: theme.colors.text.primary }]}
            >
              Your Progress
            </Text>
            <Text
              style={[styles.subtitle, { color: theme.colors.text.secondary }]}
            >
              Keep going, you're improving!
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => (navigation as any).navigate("Profile")}
            style={[
              styles.profileButton,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border + "30",
              },
            ]}
          >
            <Ionicons
              name="person-outline"
              size={22}
              color={theme.colors.accent}
            />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
              colors={[theme.colors.accent]}
            />
          }
        >
          {/* Overall Progress Card */}
          <View
            style={[
              styles.overallCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border + "20",
              },
            ]}
          >
            <Text
              style={[
                styles.sectionTitle,
                { color: theme.colors.text.primary },
              ]}
            >
              English Mastery
            </Text>
            <View style={styles.ringWrapper}>
              <ProgressRing
                score={Math.round(metrics.current.overallScore)}
                cefrLevel={metrics.current.cefrLevel}
              />
            </View>
            <TrendIndicator delta={metrics.deltas.overallScore} />
          </View>

          {/* Detailed Scores */}
          <Text
            style={[styles.sectionLabel, { color: theme.colors.text.primary }]}
          >
            Detailed Scores
          </Text>
          <View style={styles.gridRow}>
            <MetricCard
              title="Pronunciation"
              score={metrics.current.pronunciation}
              delta={metrics.deltas.pronunciation}
            />
            <MetricCard
              title="Fluency"
              score={metrics.current.fluency}
              delta={metrics.deltas.fluency}
            />
          </View>
          <View style={styles.gridRow}>
            <MetricCard
              title="Grammar"
              score={metrics.current.grammar}
              delta={metrics.deltas.grammar}
            />
            <MetricCard
              title="Vocabulary"
              score={metrics.current.vocabulary}
              delta={metrics.deltas.vocabulary}
            />
          </View>

          {/* Weekly Activity */}
          <MiniChart
            title="Activity (Last 7 Days)"
            data={metrics.weeklyActivity}
            labels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
          />

          {/* Weakness Spotlight */}
          {metrics.weaknesses.length > 0 && (
            <View
              style={[
                styles.weaknessCard,
                {
                  backgroundColor: theme.colors.deep,
                  borderColor: theme.colors.accent + "30",
                },
              ]}
            >
              <View style={styles.weaknessHeader}>
                <View
                  style={[
                    styles.weaknessIconCircle,
                    { backgroundColor: theme.colors.accent + "20" },
                  ]}
                >
                  <Ionicons
                    name="flash"
                    size={18}
                    color={theme.colors.accent}
                  />
                </View>
                <Text
                  style={[
                    styles.weaknessTitle,
                    {
                      color:
                        theme.variation === "deep"
                          ? "#FFFFFF"
                          : theme.colors.text.primary,
                    },
                  ]}
                >
                  Focus Areas
                </Text>
              </View>
              {metrics.weaknesses.map((w, i) => (
                <View key={i} style={styles.weaknessItem}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "800",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      color: theme.colors.accent,
                      marginBottom: 2,
                    }}
                  >
                    {w.skill}
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "500",
                      lineHeight: 20,
                      color:
                        theme.variation === "deep"
                          ? "rgba(255,255,255,0.8)"
                          : theme.colors.text.secondary,
                    }}
                  >
                    💡 {w.recommendation}
                  </Text>
                </View>
              ))}
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: theme.colors.accent },
                ]}
              >
                <Text style={styles.actionButtonText}>Start Practice</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View
              style={[
                styles.statCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border + "20",
                },
              ]}
            >
              <Text style={{ fontSize: 28, marginBottom: 2 }}>🔥</Text>
              <Text
                style={[styles.statValue, { color: theme.colors.text.primary }]}
              >
                {metrics.streak}
              </Text>
              <Text
                style={[
                  styles.statLabel,
                  { color: theme.colors.text.secondary },
                ]}
              >
                Day Streak
              </Text>
            </View>
            <View
              style={[
                styles.statCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border + "20",
                },
              ]}
            >
              <Text style={{ fontSize: 28, marginBottom: 2 }}>📚</Text>
              <Text
                style={[styles.statValue, { color: theme.colors.text.primary }]}
              >
                {metrics.totalSessions}
              </Text>
              <Text
                style={[
                  styles.statLabel,
                  { color: theme.colors.text.secondary },
                ]}
              >
                Sessions
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    opacity: 0.7,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  overallCard: {
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    marginBottom: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 20,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionLabel: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  ringWrapper: {
    marginBottom: 12,
  },
  gridRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  weaknessCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    marginTop: 8,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  weaknessHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  weaknessIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  weaknessTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  weaknessItem: {
    marginBottom: 14,
  },
  actionButton: {
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  actionButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    opacity: 0.7,
  },
});
