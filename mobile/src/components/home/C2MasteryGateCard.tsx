import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../theme/useAppTheme";

interface Criterion {
  label: string;
  met: boolean;
}

interface Props {
  criteria: Criterion[];
  pointsRemaining: number;
  onPress?: (action: string) => void;
}

export default function C2MasteryGateCard({
  criteria,
  pointsRemaining,
  onPress,
}: Props) {
  const theme = useAppTheme();
  const allMet = criteria.every((c) => c.met);

  const styles = getStyles(theme);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎯 C2 Mastery Gate</Text>
        {allMet && <Text style={styles.badge}>UNLOCKED!</Text>}
      </View>

      <Text style={styles.subtitle}>
        {allMet
          ? "You've met all criteria! Take the C2 assessment."
          : `${pointsRemaining} points away from C2 mastery`}
      </Text>

      <View style={styles.criteriaList}>
        {criteria.map((criterion, index) => (
          <View key={index} style={styles.criterionRow}>
            <View
              style={[
                styles.checkbox,
                criterion.met && styles.checkboxMet,
                {
                  borderColor: criterion.met
                    ? theme.colors.success
                    : theme.colors.border,
                },
              ]}
            >
              {criterion.met && (
                <Ionicons name="checkmark" size={14} color="white" />
              )}
            </View>
            <Text
              style={[
                styles.criterionLabel,
                criterion.met && styles.criterionMet,
              ]}
            >
              {criterion.label}
            </Text>
          </View>
        ))}
      </View>

      {allMet && (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.colors.warning }]}
          onPress={() => onPress?.("start_assessment")}
        >
          <Text style={styles.buttonText}>Take C2 Assessment</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      padding: 16,
      marginBottom: 16,
      marginHorizontal: 16,
      borderWidth: 2,
      borderColor: theme.colors.warning + "50",
      ...theme.shadows.medium,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    title: {
      fontSize: 16,
      fontWeight: "800",
      color: theme.colors.text.primary,
    },
    badge: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.colors.success,
    },
    subtitle: {
      fontSize: 13,
      color: theme.colors.text.secondary,
      marginBottom: 16,
      fontWeight: "500",
    },
    criteriaList: {
      marginBottom: 16,
    },
    criterionRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 10,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 10,
    },
    checkboxMet: {
      backgroundColor: theme.colors.success,
      borderColor: theme.colors.success,
    },
    criterionLabel: {
      fontSize: 13,
      color: theme.colors.text.secondary,
      fontWeight: "500",
    },
    criterionMet: {
      color: theme.colors.text.primary,
      fontWeight: "700",
    },
    button: {
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
    },
    buttonText: {
      fontSize: 15,
      fontWeight: "700",
      color: "#FFFFFF",
    },
  });
