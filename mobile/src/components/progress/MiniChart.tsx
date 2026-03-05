import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

interface MiniChartProps {
  data: number[];
  labels: string[];
  title?: string;
}

export const MiniChart: React.FC<MiniChartProps> = ({
  data,
  labels,
  title,
}) => {
  const { theme } = useTheme();
  const maxVal = Math.max(...data, 1);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      {title && (
        <Text style={[styles.title, { color: theme.colors.text.primary }]}>
          {title}
        </Text>
      )}
      <View style={styles.chartArea}>
        {data.map((val, i) => (
          <View key={i} style={styles.barContainer}>
            <View
              style={[
                styles.bar,
                {
                  height: `${(val / maxVal) * 100}%`,
                  backgroundColor: theme.colors.accent,
                  opacity: val === 0 ? 0.3 : 1,
                },
              ]}
            />
            <Text
              style={[styles.label, { color: theme.colors.text.secondary }]}
            >
              {labels[i]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 20,
  },
  chartArea: {
    flexDirection: "row",
    height: 120,
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  barContainer: {
    alignItems: "center",
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
  },
  bar: {
    width: 20,
    borderRadius: 6,
    minHeight: 4,
  },
  label: {
    fontSize: 10,
    marginTop: 8,
    fontWeight: "600",
  },
});
