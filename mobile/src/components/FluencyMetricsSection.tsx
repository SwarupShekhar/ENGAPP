import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../theme/useAppTheme";
import {
  FluencyBreakdown,
  paceColor,
  paceLabel,
} from "../types/fluency";

interface FluencyMetricsSectionProps {
  breakdown: FluencyBreakdown;
  /** Azure raw fluency before recalibration (optional). */
  rawAzureFluency?: number;
  /** Show "Recalibrated" badge (assessment). */
  showRecalibratedBadge?: boolean;
  compact?: boolean;
}

export const FluencyMetricsSection: React.FC<FluencyMetricsSectionProps> = ({
  breakdown,
  rawAzureFluency,
  showRecalibratedBadge = false,
  compact = false,
}) => {
  const theme = useAppTheme();
  const styles = getStyles(theme, compact);
  const wpm = Math.round(breakdown.wpm ?? 0);
  const fillers = breakdown.topFillers ?? [];
  const fillerCount = breakdown.fillerCount ?? 0;

  const connected =
    breakdown.connected_speech ?? breakdown.naturalness ?? 0;

  return (
    <View style={styles.container}>
      {showRecalibratedBadge ? (
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>Fluency Breakdown</Text>
          <View style={styles.recalibratedBadge}>
            <Text style={styles.recalibratedText}>Recalibrated</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.sectionTitle}>Fluency Details</Text>
      )}

      {/* Pace + fillers row */}
      <View style={styles.metricsRow}>
        <View style={[styles.metricChip, { borderColor: paceColor(wpm) }]}>
          <Ionicons name="speedometer-outline" size={18} color={paceColor(wpm)} />
          <View>
            <Text style={styles.metricValue}>{wpm} WPM</Text>
            <Text style={[styles.metricSub, { color: paceColor(wpm) }]}>
              {paceLabel(wpm)}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.metricChip,
            {
              borderColor:
                fillerCount > 3 ? "#F59E0B" : theme.colors.border,
            },
          ]}
        >
          <Ionicons
            name="chatbubble-ellipses-outline"
            size={18}
            color={fillerCount > 3 ? "#F59E0B" : "#26A69A"}
          />
          <View>
            <Text style={styles.metricValue}>{fillerCount}</Text>
            <Text style={styles.metricSub}>
              filler{fillerCount === 1 ? "" : "s"}
            </Text>
          </View>
        </View>
      </View>

      {fillers.length > 0 && (
        <View style={styles.fillerRow}>
          {fillers.slice(0, 4).map((f: string) => (
            <View key={f} style={styles.fillerTag}>
              <Text style={styles.fillerTagText}>"{f}"</Text>
            </View>
          ))}
        </View>
      )}

      {/* Component grid */}
      <View style={styles.breakdownGrid}>
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Speech Flow</Text>
          <Text style={styles.breakdownValue}>
            {Math.round(breakdown.speech_flow)}%
          </Text>
        </View>
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Connected Speech</Text>
          <Text style={styles.breakdownValue}>{Math.round(connected)}%</Text>
        </View>
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Prosody</Text>
          <Text style={styles.breakdownValue}>
            {Math.round(breakdown.prosody)}%
          </Text>
        </View>
        <View style={styles.breakdownItem}>
          <Text style={styles.breakdownLabel}>Pace Control</Text>
          <Text style={styles.breakdownValue}>
            {Math.round(breakdown.pace_control)}%
          </Text>
        </View>
      </View>

      {rawAzureFluency != null && rawAzureFluency > 0 && (
        <View style={styles.azureComparison}>
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={theme.colors.text.secondary}
          />
          <Text style={styles.azureComparisonText}>
            Adjusted from Azure's raw fluency of {Math.round(rawAzureFluency)}%
            for realism.
          </Text>
        </View>
      )}

      {(breakdown.examples?.linking_detected?.length ?? 0) > 0 ||
      (breakdown.examples?.reductions_detected?.length ?? 0) > 0 ? (
        <View style={styles.examplesContainer}>
          <Text style={styles.examplesTitle}>Connected Speech Patterns</Text>
          {breakdown.examples?.linking_detected?.map((ex: string, i: number) => (
            <View key={`link-${i}`} style={styles.exampleRow}>
              <Ionicons
                name="link-outline"
                size={14}
                color={theme.colors.success}
              />
              <Text style={styles.exampleText}>Linking: {ex}</Text>
            </View>
          ))}
          {breakdown.examples?.reductions_detected?.map((ex: string, i: number) => (
            <View key={`red-${i}`} style={styles.exampleRow}>
              <Ionicons
                name="contract-outline"
                size={14}
                color={theme.colors.primary}
              />
              <Text style={styles.exampleText}>Reduction: {ex}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const getStyles = (theme: ReturnType<typeof useAppTheme>, compact: boolean) =>
  StyleSheet.create({
    container: {
      backgroundColor: compact ? "transparent" : theme.colors.surface,
      borderRadius: compact ? 0 : 16,
      padding: compact ? 0 : 16,
      borderWidth: compact ? 0 : 1,
      borderColor: theme.colors.border,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: compact ? 15 : 16,
      fontWeight: "700",
      color: theme.colors.text.primary,
      marginBottom: compact ? 8 : 12,
    },
    recalibratedBadge: {
      backgroundColor: "rgba(79, 70, 229, 0.1)",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "rgba(79, 70, 229, 0.2)",
    },
    recalibratedText: {
      fontSize: 10,
      fontWeight: "700",
      color: theme.colors.primary,
      textTransform: "uppercase",
    },
    metricsRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 12,
    },
    metricChip: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      backgroundColor: "#E0F2F1",
    },
    metricValue: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    metricSub: {
      fontSize: 11,
      color: theme.colors.text.secondary,
      fontWeight: "600",
    },
    fillerRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 12,
    },
    fillerTag: {
      backgroundColor: "rgba(245, 158, 11, 0.12)",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
    },
    fillerTagText: {
      fontSize: 12,
      color: "#B45309",
      fontWeight: "600",
    },
    breakdownGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginHorizontal: -8,
    },
    breakdownItem: {
      width: "50%",
      padding: 8,
    },
    breakdownLabel: {
      fontSize: 12,
      color: theme.colors.text.secondary,
      marginBottom: 2,
    },
    breakdownValue: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    azureComparison: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 8,
    },
    azureComparisonText: {
      fontSize: 11,
      color: theme.colors.text.secondary,
      fontStyle: "italic",
      flex: 1,
    },
    examplesContainer: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    examplesTitle: {
      fontSize: 11,
      fontWeight: "bold",
      color: theme.colors.text.primary,
      marginBottom: 6,
    },
    exampleRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 4,
    },
    exampleText: {
      fontSize: 10,
      color: theme.colors.text.secondary,
      marginLeft: 6,
      fontStyle: "italic",
    },
  });
