import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

interface Props {
  onFinish: () => void;
}

/**
 * Full-screen cold-start splash.
 * Sequence: wordmark slides up → divider expands → pills fade in → hold → screen fades out
 * Total: ~1.4s
 */
export const SplashAnimation: React.FC<Props> = ({ onFinish }) => {
  const logoY        = useRef(new Animated.Value(12)).current;
  const logoOpacity  = useRef(new Animated.Value(0)).current;
  const lineWidth    = useRef(new Animated.Value(0)).current;
  const pillsOpacity = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Wordmark slides up + fades in (600ms)
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(logoY,       { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      // 2. Divider expands (400ms) — useNativeDriver:false required for width
      Animated.timing(lineWidth, { toValue: 140, duration: 400, useNativeDriver: false }),
      // 3. Pills fade in (350ms)
      Animated.timing(pillsOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      // 4. Hold (350ms)
      Animated.delay(350),
      // 5. Screen fades out (300ms)
      Animated.timing(screenOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onFinish());
  }, []);

  return (
    <Animated.View style={[s.screen, { opacity: screenOpacity }]}>
      {/* Wordmark */}
      <Animated.View
        style={[
          s.wordmarkRow,
          { opacity: logoOpacity, transform: [{ translateY: logoY }] },
        ]}
      >
        <Text style={s.wordmarkWhite}>ENGLI</Text>
        <Text style={s.wordmarkViolet}>VO</Text>
      </Animated.View>

      {/* Divider */}
      <Animated.View style={[s.divider, { width: lineWidth }]} />

      {/* Pills row */}
      <Animated.View style={[s.pillsRow, { opacity: pillsOpacity }]}>
        <View style={s.pillPulse}>
          <Text style={[s.pillText, { color: "#9D93D8" }]}>PULSE</Text>
        </View>
        <View style={s.dot} />
        <View style={s.pillCore}>
          <Text style={[s.pillText, { color: "#D29E3C" }]}>CORE</Text>
        </View>
      </Animated.View>
    </Animated.View>
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
    alignItems: "baseline",
    marginBottom: 14,
  },
  wordmarkWhite: {
    fontSize: 48,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 8,
  },
  wordmarkViolet: {
    fontSize: 48,
    fontWeight: "700",
    color: "#7B6FCC",
    letterSpacing: 8,
  },
  divider: {
    height: 1.5,
    backgroundColor: "#7B6FCC",
    marginBottom: 18,
  },
  pillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pillPulse: {
    borderWidth: 1,
    borderColor: "rgba(123,111,204,0.6)",
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  pillCore: {
    borderWidth: 1,
    borderColor: "rgba(210,158,60,0.5)",
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
    backgroundColor: "rgba(255,255,255,0.25)",
  },
});
