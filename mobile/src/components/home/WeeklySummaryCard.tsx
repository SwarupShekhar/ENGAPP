import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../theme/useAppTheme";
import { LinearGradient } from "expo-linear-gradient";

interface Props {
  text: string;
  sessionsCount: number;
  avgScore: number;
  highlights: string[];
  skillBreakdown?: {
    grammar: { score: number; delta: number };
    pronunciation: { score: number; delta: number };
    fluency: { score: number; delta: number };
    vocabulary: { score: number; delta: number };
  };
  actionableFocus?: {
    label: string;
    recommendation: string;
    actionLabel: string;
    action: string;
    priority?: string;
  };
  edgeCase?: string;
  progressTarget?: number;
}

export default function WeeklySummaryCard({
  text,
  sessionsCount,
  avgScore,
  highlights,
  skillBreakdown,
  actionableFocus,
  edgeCase,
  progressTarget,
}: Props) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Handle edge cases
  if (edgeCase === 'no_sessions') {
    return null; // Don't show card if no sessions
  }
  
  if (edgeCase === 'first_week') {
    return (
      <View style={[styles.container, theme.shadows.medium]}>
        <View style={styles.mayaBorder} />
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <LinearGradient
                colors={["#8B5CF6", "#A78BFA"]}
                style={styles.mayaAvatar}
              >
                <Ionicons name="sparkles" size={16} color="white" />
              </LinearGradient>
              <View>
                <Text style={styles.mayaName}>Maya</Text>
                <Text style={styles.mayaRole}>Building your baseline</Text>
              </View>
            </View>
          </View>
          
          <View style={styles.progressSection}>
            <Text style={styles.progressText}>{text}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(sessionsCount / (progressTarget || 3)) * 100}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{sessionsCount} of {progressTarget || 3} sessions completed</Text>
          </View>
          
          {actionableFocus && (
            <TouchableOpacity style={styles.ctaButton}>
              <Text style={styles.ctaText}>{actionableFocus.actionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const shouldShowReadMore = text && text.length > 180;
  const displayText = shouldShowReadMore && !isExpanded 
    ? text.slice(0, 180) + "..." 
    : text;

  return (
    <View style={[styles.container, theme.shadows.medium]}>
      {/* Maya's identity left border */}
      <View style={styles.mayaBorder} />
      
      <View style={styles.content}>
        {/* Header Row 1: Avatar + Name + Chip */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {/* Maya avatar with violet gradient */}
            <LinearGradient
              colors={["#8B5CF6", "#A78BFA"]}
              style={styles.mayaAvatar}
            >
              <Ionicons name="sparkles" size={16} color="white" />
            </LinearGradient>
            <View>
              <Text style={styles.mayaName}>Maya</Text>
              <Text style={styles.mayaRole}>Your weekly insight</Text>
            </View>
          </View>
          
          {/* "This Week" outlined chip */}
          <View style={styles.weekChip}>
            <Text style={styles.weekChipText}>This Week</Text>
          </View>
        </View>

        {/* Zone 1: Headline Insight */}
        {text && (
          <View style={styles.headlineZone}>
            <Text style={styles.headlineText}>
              {displayText}
              {shouldShowReadMore && !isExpanded && (
                <TouchableOpacity onPress={() => setIsExpanded(true)}>
                  <Text style={styles.readMore}> Read more</Text>
                </TouchableOpacity>
              )}
            </Text>
          </View>
        )}

        {/* Zone 2: Skill Delta Row */}
        {skillBreakdown && (
          <View style={styles.skillDeltaZone}>
            <View style={styles.skillDeltaRow}>
              {Object.entries(skillBreakdown).map(([skill, data]) => {
                const skillName = skill.charAt(0).toUpperCase() + skill.slice(1);
                const deltaColor = data.delta > 0 ? theme.colors.success : data.delta < 0 ? theme.colors.error : theme.colors.text.secondary;
                const deltaSymbol = data.delta > 0 ? '↑' : data.delta < 0 ? '↓' : '→';
                
                return (
                  <View key={skill} style={styles.skillDeltaItem}>
                    <Text style={styles.skillName}>{skillName.slice(0, 4)}</Text>
                    <Text style={[styles.skillDelta, { color: deltaColor }]}>
                      {data.delta >= 0 ? '+' : ''}{data.delta}{deltaSymbol}
                    </Text>
                  </View>
                );
              })}
            </View>
            
            {/* Supporting data line */}
            <Text style={styles.supportingData}>
              {sessionsCount} sessions · Avg {avgScore} this week
            </Text>
          </View>
        )}

        {/* Zone 3: Actionable Focus */}
        {actionableFocus && (
          <View style={styles.actionableFocusZone}>
            <Text style={styles.focusLabel}>{actionableFocus.label}</Text>
            <Text style={styles.focusRecommendation}>{actionableFocus.recommendation}</Text>
            <TouchableOpacity style={styles.focusAction}>
              <Text style={styles.focusActionText}>{actionableFocus.actionLabel} →</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 24,
      backgroundColor: theme.colors.surface,
      borderWidth: 0,
      position: "relative",
      overflow: "hidden",
    },
    mayaBorder: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 3,
      backgroundColor: "#8B5CF6", // Maya's exclusive violet color
    },
    content: {
      padding: 20,
      paddingLeft: 23, // Extra padding to account for border
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    mayaAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
    },
    mayaName: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    mayaRole: {
      fontSize: 12,
      fontWeight: "500",
      color: theme.colors.text.secondary,
      marginTop: 1,
    },
    weekChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: "#8B5CF6",
      backgroundColor: "transparent",
    },
    weekChipText: {
      fontSize: 12,
      fontWeight: "700",
      color: "#8B5CF6",
    },
    // First week progress styles
    progressSection: {
      marginBottom: 16,
    },
    progressText: {
      fontSize: 15,
      fontWeight: "500",
      color: theme.colors.text.primary,
      marginBottom: 12,
      lineHeight: 22,
    },
    progressBar: {
      height: 8,
      backgroundColor: theme.colors.border,
      borderRadius: 4,
      marginBottom: 8,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      backgroundColor: "#8B5CF6",
      borderRadius: 4,
    },
    progressLabel: {
      fontSize: 12,
      fontWeight: "500",
      color: theme.colors.text.secondary,
    },
    // Zone 1: Headline
    headlineZone: {
      marginBottom: 16,
    },
    headlineText: {
      fontSize: 16,
      fontWeight: "600",
      lineHeight: 24,
      color: theme.colors.text.primary,
    },
    readMore: {
      fontSize: 12,
      fontWeight: "600",
      color: "#8B5CF6",
    },
    // Zone 2: Skill Deltas
    skillDeltaZone: {
      marginBottom: 16,
    },
    skillDeltaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    skillDeltaItem: {
      alignItems: "center",
      flex: 1,
    },
    skillName: {
      fontSize: 11,
      fontWeight: "600",
      color: theme.colors.text.secondary,
      marginBottom: 2,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    skillDelta: {
      fontSize: 14,
      fontWeight: "700",
    },
    supportingData: {
      fontSize: 12,
      fontWeight: "500",
      color: theme.colors.text.secondary,
      fontStyle: "italic",
    },
    // Zone 3: Actionable Focus
    actionableFocusZone: {
      marginBottom: 8,
    },
    focusLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: theme.colors.text.secondary,
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    focusRecommendation: {
      fontSize: 14,
      fontWeight: "500",
      lineHeight: 20,
      color: theme.colors.text.primary,
      marginBottom: 12,
    },
    focusAction: {
      alignSelf: "flex-start",
    },
    focusActionText: {
      fontSize: 13,
      fontWeight: "600",
      color: "#8B5CF6",
    },
    // CTA Button
    ctaButton: {
      borderWidth: 1,
      borderColor: "#8B5CF6",
      backgroundColor: "transparent",
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: "center",
    },
    ctaText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#8B5CF6",
    },
  });
