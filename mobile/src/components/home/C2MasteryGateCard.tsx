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

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 16,
    borderWidth: 2,
    borderColor: "#F59E0B",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
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
    color: "#111827",
  },
  badge: {
    fontSize: 12,
    fontWeight: "700",
    color: "#10B981",
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
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
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  criterionLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  criterionMet: {
    color: "#111827",
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
