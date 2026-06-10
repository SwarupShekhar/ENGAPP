import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, ViewStyle, StyleProp } from "react-native";

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  /** Render as a circle (avatar placeholder); width is used as diameter */
  circle?: boolean;
  /** Light-on-dark variant for dark surfaces */
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Pulsing placeholder block for loading states.
 * Generalizes the static skeleton patterns previously inlined in screens.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = 16,
  borderRadius = 8,
  circle = false,
  dark = false,
  style,
}) => {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  const size = circle ? { width, height: width as number, borderRadius: 999 } : { width, height, borderRadius };

  return (
    <Animated.View
      style={[
        styles.base,
        dark ? styles.dark : styles.light,
        size as ViewStyle,
        { opacity },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
  },
  light: {
    backgroundColor: "#E2E8F0",
  },
  dark: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
});
