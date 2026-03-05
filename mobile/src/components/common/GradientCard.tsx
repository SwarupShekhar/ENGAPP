import React from "react";
import { StyleSheet, ViewStyle, StyleProp } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "../../theme/useAppTheme";
import { baseTheme } from "../../theme/base";

interface GradientCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  colors?: readonly string[] | string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}

export const GradientCard: React.FC<GradientCardProps> = ({
  children,
  style,
  colors,
  start = { x: 0, y: 0 },
  end = { x: 0, y: 1 },
}) => {
  const theme = useAppTheme();
  const gradientColors = colors || theme.colors.gradients.surface;

  return (
    <LinearGradient
      colors={gradientColors as any}
      start={start}
      end={end}
      style={[styles.card, style]}
    >
      {children}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: baseTheme.borderRadius.l,
    padding: baseTheme.spacing.m,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
});
