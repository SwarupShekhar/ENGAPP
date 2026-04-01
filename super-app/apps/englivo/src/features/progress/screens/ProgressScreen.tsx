import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useAppTheme } from "../../../theme/useAppTheme";
import { getPerformanceHistory, PerformanceHistory } from "../../../api/progress";
import { getCefrPath } from "../../../api/user";

const { width } = Dimensions.get("window");
const CELL_SIZE = Math.floor((width - 64) / 7);

export default function ProgressScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);

  const [perfData, setPerfData] = useState<PerformanceHistory | null>(null);
  const [cefrPath, setCefrPath] = useState<{ levels: string[]; current: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [perf, cefr] = await Promise.all([
        getPerformanceHistory(),
        getCefrPath(),
      ]);
      setPerfData(perf);
      setCefrPath(cefr);
    } catch (e) {
      console.warn("[ProgressScreen] load error:", e);
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

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const streak = perfData?.streak ?? 0;
  const totalHours = perfData?.totalHours ?? 0;
  const weeks = perfData?.weeks ?? [];

  // Build 4-week heatmap — each week has 7 days
  const heatmapWeeks = weeks.slice(-4);

  const getHeatColor = (val: number) => {
    if (val === 0) return theme.colors.border;
    if (val < 30) return `${theme.colors.primary}40`;
    if (val < 60) return `${theme.colors.primary}80`;
    return theme.colors.primary;
  };

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
        <View style={styles.headerRow}>
          <Text style={styles.title}>Progress</Text>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <LinearGradient
            colors={theme.colors.gradients.primary as any}
            style={styles.statCard}
          >
            <Ionicons name="flame" size={28} color="#0F172A" />
            <Text style={styles.statValueDark}>{streak}</Text>
            <Text style={styles.statLabelDark}>Day Streak</Text>
          </LinearGradient>
          <View style={styles.statCardOutline}>
            <Ionicons name="time" size={28} color={theme.colors.primary} />
            <Text style={styles.statValue}>{totalHours.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Total Hours</Text>
          </View>
        </View>

        {/* 4-week Heatmap */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4-Week Activity</Text>
          <View style={styles.heatmapContainer}>
            {/* Day labels */}
            <View style={styles.heatmapDayLabels}>
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <Text key={i} style={styles.heatmapDayLabel}>
                  {d}
                </Text>
              ))}
            </View>
            {heatmapWeeks.length > 0 ? (
              heatmapWeeks.map((week, wi) => (
                <View key={wi} style={styles.heatmapWeek}>
                  {week.days.map((val, di) => (
                    <View
                      key={di}
                      style={[
                        styles.heatCell,
                        { backgroundColor: getHeatColor(val) },
                      ]}
                    />
                  ))}
                </View>
              ))
            ) : (
              <Text style={styles.noDataText}>
                Complete sessions to see your heatmap
              </Text>
            )}
          </View>
        </View>

        {/* CEFR Path */}
        {cefrPath && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CEFR Path</Text>
            <View style={styles.cefrPathContainer}>
              {cefrPath.levels.map((level, idx) => {
                const isCurrent = level === cefrPath.current;
                const isPast =
                  cefrPath.levels.indexOf(cefrPath.current) > idx;
                return (
                  <React.Fragment key={level}>
                    <View
                      style={[
                        styles.cefrNode,
                        isCurrent && styles.cefrNodeCurrent,
                        isPast && styles.cefrNodePast,
                      ]}
                    >
                      {isCurrent && (
                        <View style={styles.cefrNodeDot} />
                      )}
                      <Text
                        style={[
                          styles.cefrNodeText,
                          isCurrent && styles.cefrNodeTextCurrent,
                          isPast && styles.cefrNodeTextPast,
                        ]}
                      >
                        {level}
                      </Text>
                    </View>
                    {idx < cefrPath.levels.length - 1 && (
                      <View
                        style={[styles.cefrLine, isPast && styles.cefrLinePast]}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </View>
          </View>
        )}

        {/* Fluency Trend */}
        {perfData?.fluencyTrend && perfData.fluencyTrend.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fluency Trend</Text>
            <View style={styles.trendContainer}>
              {perfData.fluencyTrend.map((val, i) => (
                <View key={i} style={styles.trendBarWrap}>
                  <View
                    style={[
                      styles.trendBar,
                      { height: Math.max(4, (val / 100) * 80) },
                    ]}
                  />
                  <Text style={styles.trendLabel}>W{i + 1}</Text>
                </View>
              ))}
            </View>
          </View>
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
    headerRow: {
      paddingHorizontal: theme.spacing.m,
      paddingTop: theme.spacing.m,
      marginBottom: theme.spacing.m,
    },
    title: {
      fontSize: theme.typography.sizes.xxl,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    statsRow: {
      flexDirection: "row",
      marginHorizontal: theme.spacing.m,
      gap: theme.spacing.m,
      marginBottom: theme.spacing.m,
    },
    statCard: {
      flex: 1,
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.l,
      alignItems: "center",
      gap: 6,
      ...theme.shadows.primaryGlow,
    },
    statCardOutline: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.l,
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    statValueDark: {
      fontSize: theme.typography.sizes.xxl,
      fontWeight: "black",
      color: "#0F172A",
    },
    statLabelDark: {
      fontSize: theme.typography.sizes.xs,
      color: "#0F172A",
      fontWeight: "600",
    },
    statValue: {
      fontSize: theme.typography.sizes.xxl,
      fontWeight: "black",
      color: theme.colors.text.primary,
    },
    statLabel: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.light,
    },
    section: {
      marginHorizontal: theme.spacing.m,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.l,
      marginBottom: theme.spacing.m,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    sectionTitle: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "bold",
      color: theme.colors.text.primary,
      marginBottom: theme.spacing.m,
    },
    heatmapContainer: { gap: 4 },
    heatmapDayLabels: {
      flexDirection: "row",
      gap: 4,
    },
    heatmapDayLabel: {
      width: CELL_SIZE,
      textAlign: "center",
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.light,
    },
    heatmapWeek: {
      flexDirection: "row",
      gap: 4,
    },
    heatCell: {
      width: CELL_SIZE,
      height: CELL_SIZE,
      borderRadius: 4,
    },
    noDataText: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
      textAlign: "center",
    },
    cefrPathContainer: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "nowrap",
      justifyContent: "center",
    },
    cefrNode: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.border,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: theme.colors.border,
    },
    cefrNodeCurrent: {
      borderColor: theme.colors.primary,
      backgroundColor: `${theme.colors.primary}20`,
    },
    cefrNodePast: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    cefrNodeDot: {
      position: "absolute",
      top: -4,
      right: -4,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.colors.primary,
      borderWidth: 2,
      borderColor: theme.colors.background,
    },
    cefrNodeText: {
      fontSize: theme.typography.sizes.xs,
      fontWeight: "bold",
      color: theme.colors.text.light,
    },
    cefrNodeTextCurrent: {
      color: theme.colors.primary,
    },
    cefrNodeTextPast: {
      color: "#0F172A",
    },
    cefrLine: {
      flex: 1,
      height: 2,
      backgroundColor: theme.colors.border,
    },
    cefrLinePast: {
      backgroundColor: theme.colors.primary,
    },
    trendContainer: {
      flexDirection: "row",
      alignItems: "flex-end",
      height: 100,
      gap: theme.spacing.s,
      justifyContent: "center",
    },
    trendBarWrap: {
      alignItems: "center",
      gap: 4,
    },
    trendBar: {
      width: 24,
      backgroundColor: theme.colors.primary,
      borderRadius: 4,
    },
    trendLabel: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.light,
    },
  });
