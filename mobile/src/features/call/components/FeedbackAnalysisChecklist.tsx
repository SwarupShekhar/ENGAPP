import React, { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useAppTheme, type AppTheme } from "../../../theme/useAppTheme";
import {
  CHECKLIST_LABELS,
  CHECKLIST_ORDER,
  type ChecklistItemKey,
  type ItemState,
} from "../utils/feedbackAnalysisSignals";

export interface FeedbackAnalysisChecklistProps {
  items: Record<ChecklistItemKey, ItemState>;
  headerTitle: string;
  headerSubtitle: string;
  hintText?: string;
}

function a11yState(state: ItemState): string {
  if (state === "done") return "complete";
  if (state === "active") return "in progress";
  return "pending";
}

function PulsingDot({ color, reduceMotion }: { color: string; reduceMotion: boolean }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, opacity]);

  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (reduceMotion) {
    return <View style={[rowStyles.dot, { backgroundColor: color }]} />;
  }
  return (
    <Animated.View style={[rowStyles.dot, { backgroundColor: color }, anim]} />
  );
}

function ChecklistRow({
  itemKey,
  state,
  primary,
  muted,
  textPrimary,
  textSecondary,
  reduceMotion,
}: {
  itemKey: ChecklistItemKey;
  state: ItemState;
  primary: string;
  muted: string;
  textPrimary: string;
  textSecondary: string;
  reduceMotion: boolean;
}) {
  const label = CHECKLIST_LABELS[itemKey];
  const done = state === "done";
  const active = state === "active";

  return (
    <View
      style={rowStyles.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}, ${a11yState(state)}`}
    >
      <View style={rowStyles.iconSlot}>
        {done ? (
          <Ionicons name="checkmark-circle" size={22} color={primary} />
        ) : active ? (
          <PulsingDot color={primary} reduceMotion={reduceMotion} />
        ) : (
          <View style={[rowStyles.emptyCircle, { borderColor: muted }]} />
        )}
      </View>
      <Text
        style={[
          rowStyles.label,
          {
            color: done || active ? textPrimary : textSecondary,
            opacity: done || active ? 1 : 0.55,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/** Analysis-wait checklist (Spec §5 / §9.2). Don't use in partner-wait mode. */
export const FeedbackAnalysisChecklist: React.FC<
  FeedbackAnalysisChecklistProps
> = ({ items, headerTitle, headerSubtitle, hintText }) => {
  const theme = useAppTheme();
  const s = getStyles(theme);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (alive) setReduceMotion(Boolean(enabled));
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) =>
      setReduceMotion(Boolean(enabled)),
    );
    return () => {
      alive = false;
      (sub as { remove?: () => void })?.remove?.();
    };
  }, []);

  const muted =
    typeof theme.colors.border === "string"
      ? theme.colors.border
      : "rgba(148, 163, 184, 0.5)";

  return (
    <View style={s.container}>
      <Text style={s.title}>{headerTitle}</Text>
      <Text style={s.subtitle}>{headerSubtitle}</Text>
      {hintText ? <Text style={s.hint}>{hintText}</Text> : null}
      <View style={s.list}>
        {CHECKLIST_ORDER.map((key) => (
          <ChecklistRow
            key={key}
            itemKey={key}
            state={items[key]}
            primary={theme.colors.primary}
            muted={muted}
            textPrimary={theme.colors.text.primary}
            textSecondary={theme.colors.text.secondary}
            reduceMotion={reduceMotion}
          />
        ))}
      </View>
    </View>
  );
};

function getStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { width: "100%", paddingHorizontal: 8 },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.text.primary,
      textAlign: "center",
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.text.secondary,
      textAlign: "center",
      marginBottom: 4,
    },
    hint: {
      fontSize: 13,
      color: theme.colors.text.secondary,
      textAlign: "center",
      marginBottom: 20,
      opacity: 0.85,
    },
    list: { marginTop: 12, gap: 14, paddingHorizontal: 12 },
  });
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 28, gap: 12 },
  iconSlot: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  emptyCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    backgroundColor: "transparent",
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  label: { fontSize: 15, fontWeight: "500", flexShrink: 1 },
});

export { PartnerWaitPanel } from "./PartnerWaitPanel";
