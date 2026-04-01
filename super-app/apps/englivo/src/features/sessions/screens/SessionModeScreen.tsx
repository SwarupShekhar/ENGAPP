import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useAppTheme } from "../../../theme/useAppTheme";

export default function SessionModeScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title}>Choose Session Type</Text>
        <Text style={styles.subtitle}>
          How would you like to practice today?
        </Text>

        {/* AI Conversation */}
        <TouchableOpacity
          style={styles.modeCard}
          activeOpacity={0.9}
          onPress={() => navigation.navigate("AiConversation")}
        >
          <LinearGradient
            colors={theme.colors.gradients.primary as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modeGradient}
          >
            <View style={styles.modeIconWrap}>
              <Ionicons name="hardware-chip" size={36} color="#0F172A" />
            </View>
            <Text style={styles.modeTitle}>AI Conversation</Text>
            <Text style={styles.modeSub}>
              Practice with Priya, your AI tutor. Available 24/7. Get instant
              feedback on grammar, pronunciation and fluency.
            </Text>
            <View style={styles.modeBadge}>
              <Ionicons name="flash" size={14} color="#0F172A" />
              <Text style={styles.modeBadgeText}>Instant · Free</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Booking */}
        <TouchableOpacity
          style={styles.modeCardOutline}
          activeOpacity={0.9}
          onPress={() => navigation.navigate("Booking")}
        >
          <View style={styles.modeOutlineInner}>
            <View style={styles.modeIconWrapOutline}>
              <Ionicons name="person" size={36} color={theme.colors.primary} />
            </View>
            <Text style={styles.modeTitleDark}>Book Human Tutor</Text>
            <Text style={styles.modeSubDark}>
              Schedule a live 1-on-1 session with a certified English tutor.
              Perfect for structured learning.
            </Text>
            <View style={styles.modeBadgeOutline}>
              <Ionicons name="calendar" size={14} color={theme.colors.primary} />
              <Text style={styles.modeBadgeOutlineText}>Scheduled · Credits</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    backButton: {
      padding: theme.spacing.m,
    },
    content: {
      flex: 1,
      paddingHorizontal: theme.spacing.m,
      paddingTop: theme.spacing.l,
    },
    title: {
      fontSize: theme.typography.sizes.xxl,
      fontWeight: "bold",
      color: theme.colors.text.primary,
      marginBottom: theme.spacing.s,
    },
    subtitle: {
      fontSize: theme.typography.sizes.m,
      color: theme.colors.text.light,
      marginBottom: theme.spacing.xl,
    },
    modeCard: {
      borderRadius: theme.borderRadius.xl,
      overflow: "hidden",
      marginBottom: theme.spacing.m,
      ...theme.shadows.primaryGlow,
    },
    modeGradient: {
      padding: theme.spacing.xl,
    },
    modeIconWrap: {
      width: 64,
      height: 64,
      borderRadius: theme.borderRadius.circle,
      backgroundColor: "rgba(0,0,0,0.15)",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: theme.spacing.m,
    },
    modeTitle: {
      fontSize: theme.typography.sizes.xl,
      fontWeight: "bold",
      color: "#0F172A",
      marginBottom: theme.spacing.s,
    },
    modeSub: {
      fontSize: theme.typography.sizes.s,
      color: "#1E293B",
      lineHeight: 20,
      marginBottom: theme.spacing.m,
    },
    modeBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(0,0,0,0.15)",
      alignSelf: "flex-start",
      paddingHorizontal: theme.spacing.m,
      paddingVertical: 4,
      borderRadius: theme.borderRadius.circle,
    },
    modeBadgeText: {
      fontSize: theme.typography.sizes.xs,
      fontWeight: "bold",
      color: "#0F172A",
    },
    modeCardOutline: {
      borderRadius: theme.borderRadius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      marginBottom: theme.spacing.m,
    },
    modeOutlineInner: { padding: theme.spacing.xl },
    modeIconWrapOutline: {
      width: 64,
      height: 64,
      borderRadius: theme.borderRadius.circle,
      backgroundColor: `${theme.colors.primary}20`,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: theme.spacing.m,
    },
    modeTitleDark: {
      fontSize: theme.typography.sizes.xl,
      fontWeight: "bold",
      color: theme.colors.text.primary,
      marginBottom: theme.spacing.s,
    },
    modeSubDark: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
      lineHeight: 20,
      marginBottom: theme.spacing.m,
    },
    modeBadgeOutline: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      alignSelf: "flex-start",
      paddingHorizontal: theme.spacing.m,
      paddingVertical: 4,
      borderRadius: theme.borderRadius.circle,
    },
    modeBadgeOutlineText: {
      fontSize: theme.typography.sizes.xs,
      fontWeight: "bold",
      color: theme.colors.primary,
    },
  });
