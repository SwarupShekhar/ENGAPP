import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  LayoutChangeEvent,
  StyleProp,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { useSuperApp } from "../../context/SuperAppContext";

// ─── Brand palettes ───────────────────────────────────────────────────────────
const ENGR = {
  gradient: ["#818CF8", "#6366F1"] as const,
  glow: "#818CF8",
  textColor: "#FFFFFF",
  mutedText: "rgba(255,255,255,0.35)",
  label: "Pulse",
};

const ENGLIVO = {
  gradient: ["#FBBF24", "#F59E0B"] as const,
  glow: "#F59E0B",
  textColor: "#1A1000",
  mutedText: "rgba(255,255,255,0.35)",
  label: "Core",
};

const PILL_HEIGHT = 36;
const PILL_V_PAD = 4;
const PILL_INNER_H = 3;

type Props = { style?: StyleProp<ViewStyle> };

export function ModeSwitcher({ style }: Props) {
  const { mode, setMode } = useSuperApp();
  const [trackW, setTrackW] = useState(0);

  // ── Sliding pill ───────────────────────────────────────────────────────────
  const tx = useSharedValue(0);
  const widthSv = useSharedValue(0);

  useEffect(() => {
    widthSv.value = trackW;
  }, [trackW, widthSv]);

  useEffect(() => {
    if (trackW <= 0) return;
    tx.value = withSpring(mode === "ENGR" ? 0 : trackW / 2, {
      damping: 20,
      stiffness: 260,
      mass: 0.8,
    });
  }, [mode, trackW, tx]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTrackW(w);
    tx.value = withSpring(mode === "ENGR" ? 0 : w / 2, {
      damping: 20,
      stiffness: 260,
      mass: 0.8,
    });
  };

  const pillStyle = useAnimatedStyle(() => ({
    width: Math.max(0, widthSv.value / 2),
    transform: [{ translateX: tx.value }],
  }));

  // ── Active pill aura pulse (soft blurry glow) ───────────────────────────
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 950 }),
        withTiming(0, { duration: 950 }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const auraStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 1], [1, 1.09], Extrapolation.CLAMP);
    const opacity = interpolate(pulse.value, [0, 1], [0.16, 0.34], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ scale }],
      backgroundColor: mode === "ENGR" ? "rgba(129,140,248,0.45)" : "rgba(251,191,36,0.34)",
    };
  });

  // ── Outer container glow pulses between brand colors ──────────────────────
  const glowProgress = useSharedValue(mode === "ENGR" ? 0 : 1);

  useEffect(() => {
    glowProgress.value = withTiming(mode === "ENGR" ? 0 : 1, { duration: 320 });
  }, [mode, glowProgress]);

  const containerStyle = useAnimatedStyle(() => ({
    borderColor: glowProgress.value < 0.5
      ? `rgba(129, 140, 248, ${interpolate(glowProgress.value, [0, 0.5], [0.55, 0.2], Extrapolation.CLAMP)})`
      : `rgba(251, 191, 36, ${interpolate(glowProgress.value, [0.5, 1], [0.2, 0.55], Extrapolation.CLAMP)})`,
    shadowColor: glowProgress.value < 0.5 ? ENGR.glow : ENGLIVO.glow,
  }));

  // ── Per-tab icon scale punch ───────────────────────────────────────────────
  return (
    <Animated.View style={[styles.container, containerStyle, style]}>
      <View style={styles.track} onLayout={onTrackLayout}>

        {/* ── Sliding gradient pill ────────────────────────────────────── */}
        <Animated.View style={[styles.pillWrapper, pillStyle]} pointerEvents="none">
          <Animated.View style={[styles.pillAura, auraStyle]} />
          <LinearGradient
            colors={mode === "ENGR" ? ENGR.gradient : ENGLIVO.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.pillGradient}
          >
            <Animated.View style={[styles.pillInnerPulse, auraStyle]} />
          </LinearGradient>
        </Animated.View>

        {/* ── eNGR tab ─────────────────────────────────────────────────── */}
        <Pressable
          style={styles.tab}
          onPress={() => setMode("ENGR")}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === "ENGR" }}
          accessibilityLabel="Switch to eNGR mode"
        >
          <Text
            style={[styles.label, { color: mode === "ENGR" ? ENGR.textColor : ENGR.mutedText }]}
            numberOfLines={1}
          >
            {ENGR.label}
          </Text>
        </Pressable>

        {/* ── Englivo tab ───────────────────────────────────────────────── */}
        <Pressable
          style={styles.tab}
          onPress={() => setMode("ENGLIVO")}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === "ENGLIVO" }}
          accessibilityLabel="Switch to Englivo mode"
        >
          <Text
            style={[styles.label, { color: mode === "ENGLIVO" ? ENGLIVO.textColor : ENGLIVO.mutedText }]}
            numberOfLines={1}
          >
            {ENGLIVO.label}
          </Text>
        </Pressable>

      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(15, 15, 26, 0.92)",
    // iOS glow
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    // Android
    elevation: 6,
    alignSelf: "center",
  },
  track: {
    flexDirection: "row",
    position: "relative",
    minWidth: 164,
    height: PILL_HEIGHT,
    borderRadius: 999,
    overflow: "hidden",
  },
  pillWrapper: {
    position: "absolute",
    top: PILL_V_PAD,
    bottom: PILL_V_PAD,
    left: 0,
    borderRadius: 999,
    overflow: "hidden",
  },
  pillGradient: {
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  pillAura: {
    position: "absolute",
    top: -6,
    bottom: -6,
    left: -6,
    right: -6,
    borderRadius: 999,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 6,
  },
  pillInnerPulse: {
    width: "82%",
    height: "74%",
    borderRadius: 999,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    zIndex: 1,
    paddingHorizontal: 8,
  },
  label: {
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
