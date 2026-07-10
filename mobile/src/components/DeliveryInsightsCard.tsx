import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../theme/useAppTheme";
import type { DeliveryInsight } from "../types/delivery";

const SEVERITY_STYLES = {
  info: {
    border: "#26A69A",
    bg: "#E0F2F1",
    icon: "checkmark-circle-outline" as const,
    iconColor: "#26A69A",
  },
  tip: {
    border: "#F59E0B",
    bg: "#FFFBEB",
    icon: "bulb-outline" as const,
    iconColor: "#D97706",
  },
  focus: {
    border: "#F97316",
    bg: "#FFF7ED",
    icon: "flag-outline" as const,
    iconColor: "#EA580C",
  },
};

interface DeliveryInsightsCardProps {
  insights: DeliveryInsight[];
}

export const DeliveryInsightsCard: React.FC<DeliveryInsightsCardProps> = ({
  insights,
}) => {
  const theme = useAppTheme();
  const styles = getStyles(theme);

  if (!insights?.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Delivery</Text>
      <Text style={styles.subtitle}>
        How you sounded in this recording
      </Text>
      {insights.map((insight, index) => {
        const palette = SEVERITY_STYLES[insight.severity] ?? SEVERITY_STYLES.tip;
        return (
          <View
            key={`${insight.id}-${index}`}
            style={[
              styles.row,
              { borderLeftColor: palette.border, backgroundColor: palette.bg },
            ]}
          >
            <Ionicons
              name={palette.icon}
              size={20}
              color={palette.iconColor}
              style={styles.icon}
            />
            <View style={styles.textWrap}>
              <Text style={styles.label}>{insight.label}</Text>
              <Text style={styles.message}>{insight.message}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const getStyles = (theme: ReturnType<typeof useAppTheme>) =>
  StyleSheet.create({
    container: {
      marginTop: 16,
    },
    title: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.colors.text.primary,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 12,
      color: theme.colors.text.secondary,
      marginBottom: 12,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      padding: 12,
      borderRadius: 12,
      borderLeftWidth: 4,
      marginBottom: 8,
    },
    icon: {
      marginRight: 10,
      marginTop: 2,
    },
    textWrap: {
      flex: 1,
    },
    label: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.colors.text.primary,
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    message: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.text.primary,
    },
  });
