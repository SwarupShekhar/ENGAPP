import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from "react-native-reanimated";

const QUINT   = Easing.bezier(0.22, 1, 0.36, 1);
const q       = (d: number) => ({ duration: d, easing: QUINT });
const GRAVITY = { damping: 10, stiffness: 130, mass: 0.7 }; // ζ≈0.52 — underdamped, settle bounce
const SPRING  = { damping: 16, stiffness: 120, mass: 0.8 }; // pills — more controlled

interface Props {
  onFinish: () => void;
}

const CHARS = ['E', 'N', 'G', 'L', 'I', 'V', 'O'] as const;

/**
 * Full-screen cold-start splash.
 * Entrance: each letter of ENGLIVO falls from above with a gravity spring (22ms stagger).
 * Divider expands, pills slide in from sides.
 * Exit: "dive" — screen scales up + fades.
 * Total: ~1520ms
 */
export const SplashAnimation: React.FC<Props> = ({ onFinish }) => {
  // Per-character shared values — hooks cannot be called in loops, declared individually
  const y0 = useSharedValue(-50); const o0 = useSharedValue(0);
  const y1 = useSharedValue(-50); const o1 = useSharedValue(0);
  const y2 = useSharedValue(-50); const o2 = useSharedValue(0);
  const y3 = useSharedValue(-50); const o3 = useSharedValue(0);
  const y4 = useSharedValue(-50); const o4 = useSharedValue(0);
  const y5 = useSharedValue(-50); const o5 = useSharedValue(0);
  const y6 = useSharedValue(-50); const o6 = useSharedValue(0);

  const dividerOpacity = useSharedValue(0);
  const dividerScale   = useSharedValue(0);
  const pulseX         = useSharedValue(-25);
  const pulseOpacity   = useSharedValue(0);
  const coreX          = useSharedValue(25);
  const coreOpacity    = useSharedValue(0);
  const screenOpacity  = useSharedValue(1);
  const screenScale    = useSharedValue(1);

  useEffect(() => {
    const charY = [y0, y1, y2, y3, y4, y5, y6];
    const charO = [o0, o1, o2, o3, o4, o5, o6];

    // Phase 1: each character falls from y=-50 with gravity spring, 22ms stagger
    // Fast opacity (80ms) so the fall arc is visible, not just the landing
    charY.forEach((sv, i) => { sv.value = withDelay(i * 22, withSpring(0, GRAVITY)); });
    charO.forEach((sv, i) => { sv.value = withDelay(i * 22, withTiming(1, q(80))); });

    // Phase 2: divider expands (t=420, overlaps tail of character falls)
    dividerOpacity.value = withDelay(420, withTiming(1, q(320)));
    dividerScale.value   = withDelay(420, withTiming(1, q(360)));

    // Phase 3: PULSE from left, CORE from right, 70ms stagger (t=570 / t=640)
    pulseOpacity.value = withDelay(570, withTiming(1, q(340)));
    pulseX.value       = withDelay(570, withSpring(0, SPRING));
    coreOpacity.value  = withDelay(640, withTiming(1, q(340)));
    coreX.value        = withDelay(640, withSpring(0, SPRING));

    // Phase 4: dive exit at t=1100
    const exitTimer = setTimeout(() => {
      screenScale.value    = withTiming(1.05, q(380));
      screenOpacity.value  = withDelay(100, withTiming(0, q(280)));
      charO.forEach(sv => { sv.value = withTiming(0, q(200)); });
      dividerOpacity.value = withTiming(0, q(180));
      pulseOpacity.value   = withTiming(0, q(180));
      coreOpacity.value    = withTiming(0, q(180));
    }, 1100);

    const doneTimer = setTimeout(() => onFinish(), 1520);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  // Animated style per character
  const cs0 = useAnimatedStyle(() => ({ opacity: o0.value, transform: [{ translateY: y0.value }] }));
  const cs1 = useAnimatedStyle(() => ({ opacity: o1.value, transform: [{ translateY: y1.value }] }));
  const cs2 = useAnimatedStyle(() => ({ opacity: o2.value, transform: [{ translateY: y2.value }] }));
  const cs3 = useAnimatedStyle(() => ({ opacity: o3.value, transform: [{ translateY: y3.value }] }));
  const cs4 = useAnimatedStyle(() => ({ opacity: o4.value, transform: [{ translateY: y4.value }] }));
  const cs5 = useAnimatedStyle(() => ({ opacity: o5.value, transform: [{ translateY: y5.value }] }));
  const cs6 = useAnimatedStyle(() => ({ opacity: o6.value, transform: [{ translateY: y6.value }] }));
  const charStyles = [cs0, cs1, cs2, cs3, cs4, cs5, cs6];

  const dividerStyle = useAnimatedStyle(() => ({
    opacity: dividerOpacity.value,
    transform: [{ scaleX: dividerScale.value }],
  }));
  const pulseStyle   = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ translateX: pulseX.value }],
  }));
  const coreStyle    = useAnimatedStyle(() => ({
    opacity: coreOpacity.value,
    transform: [{ translateX: coreX.value }],
  }));
  const dotStyle     = useAnimatedStyle(() => ({ opacity: dividerOpacity.value }));
  const screenStyle  = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
    transform: [{ scale: screenScale.value }],
  }));

  return (
    <Reanimated.View style={[s.screen, screenStyle]}>
      {/* Wordmark — each character falls independently */}
      <View style={s.wordmarkRow}>
        {CHARS.map((char, i) => (
          <Reanimated.View key={i} style={charStyles[i]}>
            <Text style={i < 5 ? s.charWhite : s.charViolet}>{char}</Text>
          </Reanimated.View>
        ))}
      </View>

      {/* Divider */}
      <Reanimated.View style={[s.divider, dividerStyle]} />

      {/* Mode pills */}
      <View style={s.pillsRow}>
        <Reanimated.View style={[s.pillPulse, pulseStyle]}>
          <Text style={[s.pillText, { color: "#9D93D8" }]}>PULSE</Text>
        </Reanimated.View>
        <Reanimated.View style={dotStyle}>
          <View style={s.dot} />
        </Reanimated.View>
        <Reanimated.View style={[s.pillCore, coreStyle]}>
          <Text style={[s.pillText, { color: "#C9923A" }]}>CORE</Text>
        </Reanimated.View>
      </View>
    </Reanimated.View>
  );
};

const s = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    backgroundColor: "#08080F",
    alignItems: "center",
    justifyContent: "center",
  },
  wordmarkRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  charWhite: {
    fontSize: 48,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 8,
  },
  charViolet: {
    fontSize: 48,
    fontWeight: "700",
    color: "#818CF8",
    letterSpacing: 8,
  },
  divider: {
    width: 140,
    height: 1.5,
    backgroundColor: "rgba(129,140,248,0.45)",
    marginBottom: 18,
  },
  pillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pillPulse: {
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.5)",
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  pillCore: {
    borderWidth: 1,
    borderColor: "rgba(201,146,58,0.45)",
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2.5,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
});
