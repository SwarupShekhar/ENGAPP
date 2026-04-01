import React from "react";
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useAppTheme } from "../../../theme/useAppTheme";

export default function EnglivoSessionModeScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title}>Choose Session Type</Text>

        <TouchableOpacity style={styles.modeCard} onPress={() => navigation.navigate("EnglivoAiConversation")}>
          <LinearGradient colors={theme.colors.gradients.primary as any} style={styles.modeGradient}>
            <Ionicons name="hardware-chip" size={36} color="#0F172A" />
            <Text style={styles.modeTitle}>AI Conversation</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={styles.modeCardOutline} onPress={() => navigation.navigate("EnglivoBooking")}>
          <View style={styles.modeOutlineInner}>
            <Ionicons name="person" size={36} color={theme.colors.primary} />
            <Text style={styles.modeTitleDark}>Book Human Tutor</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    backButton: { padding: theme.spacing.m },
    content: { flex: 1, paddingHorizontal: theme.spacing.m, paddingTop: theme.spacing.l },
    title: { fontSize: theme.typography.sizes.xxl, fontWeight: "bold", color: theme.colors.text.primary, marginBottom: theme.spacing.xl },
    modeCard: { borderRadius: theme.borderRadius.xl, overflow: "hidden", marginBottom: theme.spacing.m },
    modeGradient: { padding: theme.spacing.xl, alignItems: "center" },
    modeTitle: { fontSize: theme.typography.sizes.xl, fontWeight: "bold", color: "#0F172A", marginTop: theme.spacing.s },
    modeCardOutline: { borderRadius: theme.borderRadius.xl, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, marginBottom: theme.spacing.m },
    modeOutlineInner: { padding: theme.spacing.xl, alignItems: "center" },
    modeTitleDark: { fontSize: theme.typography.sizes.xl, fontWeight: "bold", color: theme.colors.text.primary, marginTop: theme.spacing.s },
  });
