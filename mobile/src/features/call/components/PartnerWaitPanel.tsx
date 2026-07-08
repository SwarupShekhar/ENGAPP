import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "../../../theme/useAppTheme";

export interface PartnerWaitPanelProps {
  title?: string;
  body?: string;
}

/** Partner-wait illustration + copy (Spec §4.1 / §7.4). No checklist. */
export const PartnerWaitPanel: React.FC<PartnerWaitPanelProps> = ({
  title = "Waiting for your partner",
  body = "Ask your partner to end the call so we can analyze the conversation.",
}) => {
  const theme = useAppTheme();
  const styles = getStyles(theme);

  return (
    <View style={styles.container} accessible accessibilityRole="text">
      <View
        style={[styles.iconBubble, { backgroundColor: `${theme.colors.primary}18` }]}
      >
        <Ionicons name="people" size={36} color={theme.colors.primary} />
      </View>
      <Ionicons
        name="hourglass-outline"
        size={20}
        color={theme.colors.text.secondary}
        style={{ marginTop: 8 }}
      />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
};

function getStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      width: "100%",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    iconBubble: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.colors.text.primary,
      textAlign: "center",
      marginTop: 12,
      marginBottom: 8,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.text.secondary,
      textAlign: "center",
    },
  });
}
