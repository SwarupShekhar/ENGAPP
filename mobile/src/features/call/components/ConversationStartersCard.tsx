import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  StyleProp,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import { useAppTheme } from "../../../theme/useAppTheme";
import type { ConversationStarter } from "../data/conversationStarters";

/**
 * Small dismissible card with 3 conversation starter prompts (PRD 4.2, Fear 3).
 * Shown expanded while connecting; collapsible in-call so it never crowds the
 * live transcript.
 */
export function ConversationStartersCard({
  starters,
  onDismiss,
  defaultCollapsed = false,
  style,
}: {
  starters: ConversationStarter[];
  onDismiss: () => void;
  defaultCollapsed?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (starters.length === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={[styles.card, style]}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.headerTap}
          onPress={() => setCollapsed((c) => !c)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={
            collapsed ? "Expand conversation starters" : "Collapse conversation starters"
          }
        >
          <Ionicons name="bulb" size={16} color={theme.colors.warning} />
          <Text style={styles.title}>Not sure what to say?</Text>
          <Ionicons
            name={collapsed ? "chevron-down" : "chevron-up"}
            size={16}
            color={theme.colors.text.secondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss conversation starters"
        >
          <Ionicons name="close" size={16} color={theme.colors.text.secondary} />
        </TouchableOpacity>
      </View>

      {!collapsed && (
        <View style={styles.list}>
          {starters.map((starter, index) => (
            <View key={starter.id} style={styles.row}>
              <View style={styles.numBadge}>
                <Text style={styles.numText}>{index + 1}</Text>
              </View>
              <Text style={styles.starterText}>{starter.text}</Text>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.l,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.s,
      ...theme.shadows.small,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.s,
      paddingVertical: 4,
    },
    headerTap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.s,
    },
    title: {
      flex: 1,
      fontSize: theme.typography.sizes.s,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    list: {
      marginTop: theme.spacing.s,
      gap: theme.spacing.s,
      paddingBottom: 4,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.s,
    },
    numBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: theme.colors.primary + "15",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 1,
    },
    numText: {
      fontSize: theme.typography.sizes.xs,
      fontWeight: "700",
      color: theme.colors.primary,
    },
    starterText: {
      flex: 1,
      fontSize: theme.typography.sizes.s,
      lineHeight: 20,
      color: theme.colors.text.secondary,
    },
  });
