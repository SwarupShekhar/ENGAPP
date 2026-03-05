import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { Ionicons } from "@expo/vector-icons";

interface TrendIndicatorProps {
  delta: number;
  label?: string;
}

export const TrendIndicator: React.FC<TrendIndicatorProps> = ({
  delta,
  label = "from last assessment",
}) => {
  const { theme } = useTheme();
  const rounded = Math.round(delta * 10) / 10; // clean rounding

  const deltaColor =
    rounded > 0
      ? "#10B981"
      : rounded < 0
        ? "#F43F5E"
        : theme.colors.text.secondary;

  const deltaIcon =
    rounded > 0 ? "trending-up" : rounded < 0 ? "trending-down" : "remove";

  return (
    <View style={styles.container}>
      <View style={[styles.badge, { backgroundColor: deltaColor + "15" }]}>
        <Ionicons name={deltaIcon as any} size={14} color={deltaColor} />
        <Text style={[styles.indicator, { color: deltaColor }]}>
          {rounded > 0 ? "+" : ""}
          {rounded}
        </Text>
      </View>
      <Text style={[styles.label, { color: theme.colors.text.secondary }]}>
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  indicator: {
    fontSize: 14,
    fontWeight: "700",
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    opacity: 0.7,
  },
});
