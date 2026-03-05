import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../theme/useAppTheme";
import { LinearGradient } from "expo-linear-gradient";

interface Props {
  text: string;
  sessionsCount: number;
  avgScore: number;
  highlights: string[];
}

export default function WeeklySummaryCard({
  text,
  sessionsCount,
  avgScore,
  highlights,
}: Props) {
  const theme = useAppTheme();

  return (
    <LinearGradient
      colors={["#F3F0FF", "#E9E2FF"]}
      style={styles.container}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.header}>
        <View style={styles.aiLabel}>
          <Ionicons name="sparkles" size={14} color="#8B5CF6" />
          <Text style={styles.aiLabelText}>LEXA AI SUMMARY</Text>
        </View>
        <Text style={styles.dateRange}>This Week</Text>
      </View>

      <Text style={styles.summaryText}>{text}</Text>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{sessionsCount}</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{avgScore}</Text>
          <Text style={styles.statLabel}>Avg Score</Text>
        </View>
      </View>

      <View style={styles.highlights}>
        {highlights.map((h, i) => (
          <View key={i} style={styles.highlightItem}>
            <Text style={styles.highlightText}>{h}</Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F3F0FF",
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.2)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  aiLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  aiLabelText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#8B5CF6",
    letterSpacing: 0.5,
  },
  dateRange: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  summaryText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#1F2937",
    fontWeight: "600",
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: "60%",
    backgroundColor: "rgba(0,0,0,0.05)",
    alignSelf: "center",
  },
  highlights: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  highlightItem: {
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  highlightText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6D28D9",
  },
});
