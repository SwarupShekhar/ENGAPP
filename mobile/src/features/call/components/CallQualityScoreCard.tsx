import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../../theme/useAppTheme";
import Animated, { FadeInUp } from "react-native-reanimated";

interface CallQualityScoreCardProps {
  cqs: number;
  breakdown: {
    pqs: number;
    ds: number;
    cs: number;
    es: number;
  };
}

export const CallQualityScoreCard: React.FC<CallQualityScoreCardProps> = ({
  cqs,
  breakdown,
}) => {
  const theme = useAppTheme();
  const styles = getStyles(theme);

  const dimensions = [
    { label: "Pronunciation Clearity", score: breakdown.pqs, icon: "mic", color: "#3B82F6" },
    { label: "Topic Depth", score: breakdown.ds, icon: "layers", color: "#8B5CF6" },
    { label: "Grammar & Complexity", score: breakdown.cs, icon: "construct", color: "#EC4899" },
    { label: "Interactive Engagement", score: breakdown.es, icon: "people", color: "#F59E0B" },
  ];

  return (
    <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.cqsCircle}>
          <Text style={styles.cqsValue}>{Math.round(cqs)}</Text>
          <Text style={styles.cqsLabel}>CQS</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Call Quality Score</Text>
          <Text style={styles.subtitle}>Overall performance based on 4 dimensions</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {dimensions.map((dim, idx) => (
          <View key={idx} style={styles.dimCard}>
            <View style={[styles.dimIcon, { backgroundColor: dim.color + '15' }]}>
              <Ionicons name={dim.icon as any} size={16} color={dim.color} />
            </View>
            <Text style={styles.dimLabel}>{dim.label}</Text>
            <View style={styles.dimBarBg}>
              <View 
                style={[
                  styles.dimBarFill, 
                  { width: `${dim.score}%`, backgroundColor: dim.color }
                ]} 
              />
            </View>
            <Text style={[styles.dimScore, { color: dim.color }]}>{Math.round(dim.score)}%</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
};

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: "white",
      borderRadius: 24,
      padding: 20,
      marginHorizontal: 20,
      marginBottom: 20,
      ...theme.shadows.medium,
      borderWidth: 1,
      borderColor: theme.colors.border + "10",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 24,
      gap: 16,
    },
    cqsCircle: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: theme.colors.primary,
      justifyContent: "center",
      alignItems: "center",
      ...theme.shadows.primaryGlow,
    },
    cqsValue: {
      color: "white",
      fontSize: 24,
      fontWeight: "900",
    },
    cqsLabel: {
      color: "rgba(255,255,255,0.8)",
      fontSize: 10,
      fontWeight: "700",
      marginTop: -2,
    },
    headerText: {
      flex: 1,
    },
    title: {
      fontSize: 18,
      fontWeight: "800",
      color: theme.colors.text.primary,
      marginBottom: 2,
    },
    subtitle: {
      fontSize: 12,
      color: theme.colors.text.secondary,
      lineHeight: 16,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    dimCard: {
      width: "48%",
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.colors.border + "10",
    },
    dimIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 8,
    },
    dimLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: theme.colors.text.primary,
      marginBottom: 8,
      height: 30,
    },
    dimBarBg: {
      height: 4,
      backgroundColor: theme.colors.border + "20",
      borderRadius: 2,
      marginBottom: 6,
      overflow: "hidden",
    },
    dimBarFill: {
      height: "100%",
      borderRadius: 2,
    },
    dimScore: {
      fontSize: 12,
      fontWeight: "800",
      textAlign: "right",
    },
  });
