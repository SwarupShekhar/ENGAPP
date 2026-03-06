import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../theme/useAppTheme";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

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

  // Use a soft gradient based on the primary color for the background
  const isDeep = theme.variation === "deep";

  const styles = getStyles(theme);

  return (
    <View style={[styles.containerOuter, theme.shadows.medium]}>
      <BlurView
        intensity={isDeep ? 40 : 80}
        tint={isDeep ? "dark" : "light"}
        style={styles.blurContainer}
      >
        <LinearGradient
          colors={[
            theme.colors.primary + (isDeep ? "20" : "15"),
            theme.colors.surface + (isDeep ? "80" : "90"),
          ]}
          style={styles.gradientFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.header}>
            <View
              style={[
                styles.aiLabel,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <Ionicons
                name="sparkles"
                size={14}
                color={theme.colors.primary}
              />
              <Text
                style={[styles.aiLabelText, { color: theme.colors.primary }]}
              >
                MAYA AI SUMMARY
              </Text>
            </View>
            <Text
              style={[styles.dateRange, { color: theme.colors.text.secondary }]}
            >
              This Week
            </Text>
          </View>

          <Text
            style={[styles.summaryText, { color: theme.colors.text.primary }]}
          >
            {text}
          </Text>

          <View
            style={[
              styles.statsRow,
              {
                backgroundColor: isDeep
                  ? "rgba(0,0,0,0.2)"
                  : "rgba(255,255,255,0.6)",
              },
            ]}
          >
            <View style={styles.statItem}>
              <Text
                style={[styles.statValue, { color: theme.colors.text.primary }]}
              >
                {sessionsCount}
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
            <View
              style={[styles.divider, { backgroundColor: theme.colors.border }]}
            />
            <View style={styles.statItem}>
              <Text
                style={[styles.statValue, { color: theme.colors.text.primary }]}
              >
                {avgScore}
              </Text>
              <Text
                style={[
                  styles.statLabel,
                  { color: theme.colors.text.secondary },
                ]}
              >
                Avg Score
              </Text>
            </View>
          </View>

          <View style={styles.highlights}>
            {highlights.map((h, i) => (
              <View
                key={i}
                style={[
                  styles.highlightItem,
                  { backgroundColor: theme.colors.primary + "15" },
                ]}
              >
                <Text
                  style={[
                    styles.highlightText,
                    { color: theme.colors.primary },
                  ]}
                >
                  {h}
                </Text>
              </View>
            ))}
          </View>
        </LinearGradient>
      </BlurView>
    </View>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    containerOuter: {
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 24,
      overflow: "hidden",
      borderWidth: 1,
      borderColor:
        theme.colors.border + (theme.variation === "deep" ? "40" : "60"),
    },
    blurContainer: {
      width: "100%",
    },
    gradientFill: {
      padding: 24,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    aiLabel: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 100,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    aiLabelText: {
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    dateRange: {
      fontSize: 13,
      fontWeight: "600",
    },
    summaryText: {
      fontSize: 18,
      lineHeight: 26,
      fontWeight: "600",
      marginBottom: 24,
    },
    statsRow: {
      flexDirection: "row",
      borderRadius: 16,
      padding: 16,
      marginBottom: 20,
    },
    statItem: {
      flex: 1,
      alignItems: "center",
    },
    statValue: {
      fontSize: 24,
      fontWeight: "800",
    },
    statLabel: {
      fontSize: 13,
      marginTop: 4,
      fontWeight: "500",
    },
    divider: {
      width: 1,
      height: "100%",
      alignSelf: "center",
    },
    highlights: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    highlightItem: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
    },
    highlightText: {
      fontSize: 13,
      fontWeight: "700",
    },
  });
