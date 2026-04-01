import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useAppTheme } from "../../../theme/useAppTheme";
import { getHistory } from "../../../api/user";
import { SessionHistory } from "../../../types/user";

export default function SessionsScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation<any>();
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const hist = await getHistory();
      setHistory(Array.isArray(hist) ? hist : []);
    } catch (e) {
      console.warn("[SessionsScreen] load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const safeHistory = Array.isArray(history) ? history : [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Sessions</Text>
        </View>

        {/* AI Tutor Card */}
        <TouchableOpacity
          style={styles.optionCard}
          activeOpacity={0.9}
          onPress={() => navigation.navigate("AiConversation")}
        >
          <LinearGradient
            colors={theme.colors.gradients.primary as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.optionGradient}
          >
            <View style={styles.optionIconWrap}>
              <Ionicons name="hardware-chip" size={30} color="#0F172A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>AI Conversation</Text>
              <Text style={styles.optionSub}>
                Practice speaking with Priya, your AI tutor
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color="#0F172A" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Human Tutor Card */}
        <TouchableOpacity
          style={styles.optionCardOutline}
          activeOpacity={0.9}
          onPress={() => navigation.navigate("Booking")}
        >
          <View style={styles.optionCardOutlineContent}>
            <View style={styles.optionIconWrapOutline}>
              <Ionicons name="person" size={28} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitleDark}>Book Human Tutor</Text>
              <Text style={styles.optionSubDark}>
                Schedule a live session with a certified tutor
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={theme.colors.text.light}
            />
          </View>
        </TouchableOpacity>

        {/* History */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Session History</Text>
          <Text style={styles.sectionCount}>{safeHistory.length} sessions</Text>
        </View>

        {loading ? (
          <ActivityIndicator
            style={{ marginTop: 32 }}
            color={theme.colors.primary}
          />
        ) : safeHistory.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="chatbubbles-outline"
              size={48}
              color={theme.colors.text.light}
            />
            <Text style={styles.emptyText}>No sessions yet.</Text>
            <Text style={styles.emptySubText}>
              Start an AI conversation or book a tutor above.
            </Text>
          </View>
        ) : (
          safeHistory.map((s) => (
            <View key={s.id} style={styles.historyRow}>
              <View style={styles.historyIcon}>
                <Ionicons
                  name={
                    s.type === "AI"
                      ? "hardware-chip-outline"
                      : "person-outline"
                  }
                  size={20}
                  color={theme.colors.primary}
                />
              </View>
              <View style={{ flex: 1, marginLeft: theme.spacing.s }}>
                <Text style={styles.historyType}>
                  {s.type === "AI" ? "AI Tutor" : "Human Tutor"}
                </Text>
                <Text style={styles.historyMeta}>
                  {s.durationMinutes} min
                  {s.cefrLevel ? ` · ${s.cefrLevel}` : ""}
                  {" · "}
                  {new Date(s.createdAt).toLocaleDateString()}
                </Text>
              </View>
              {s.score !== undefined && (
                <Text style={styles.historyScore}>{s.score}%</Text>
              )}
            </View>
          ))
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.m,
      paddingTop: theme.spacing.m,
      marginBottom: theme.spacing.m,
    },
    title: {
      fontSize: theme.typography.sizes.xxl,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    optionCard: {
      marginHorizontal: theme.spacing.m,
      borderRadius: theme.borderRadius.xl,
      overflow: "hidden",
      marginBottom: theme.spacing.m,
      ...theme.shadows.primaryGlow,
    },
    optionGradient: {
      flexDirection: "row",
      alignItems: "center",
      padding: theme.spacing.l,
      gap: theme.spacing.m,
    },
    optionIconWrap: {
      width: 52,
      height: 52,
      borderRadius: theme.borderRadius.m,
      backgroundColor: "rgba(0,0,0,0.15)",
      justifyContent: "center",
      alignItems: "center",
    },
    optionTitle: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "bold",
      color: "#0F172A",
    },
    optionSub: {
      fontSize: theme.typography.sizes.s,
      color: "#1E293B",
      marginTop: 2,
    },
    optionCardOutline: {
      marginHorizontal: theme.spacing.m,
      borderRadius: theme.borderRadius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      marginBottom: theme.spacing.m,
    },
    optionCardOutlineContent: {
      flexDirection: "row",
      alignItems: "center",
      padding: theme.spacing.l,
      gap: theme.spacing.m,
    },
    optionIconWrapOutline: {
      width: 52,
      height: 52,
      borderRadius: theme.borderRadius.m,
      backgroundColor: `${theme.colors.primary}20`,
      justifyContent: "center",
      alignItems: "center",
    },
    optionTitleDark: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    optionSubDark: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
      marginTop: 2,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.m,
      marginBottom: theme.spacing.s,
    },
    sectionTitle: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    sectionCount: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
    },
    emptyState: {
      alignItems: "center",
      marginTop: theme.spacing.xxl,
      paddingHorizontal: theme.spacing.xl,
    },
    emptyText: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "600",
      color: theme.colors.text.secondary,
      marginTop: theme.spacing.m,
    },
    emptySubText: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
      textAlign: "center",
      marginTop: theme.spacing.s,
    },
    historyRow: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: theme.spacing.m,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.m,
      padding: theme.spacing.m,
      marginBottom: theme.spacing.s,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    historyIcon: {
      width: 36,
      height: 36,
      borderRadius: theme.borderRadius.m,
      backgroundColor: `${theme.colors.primary}20`,
      justifyContent: "center",
      alignItems: "center",
    },
    historyType: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "600",
      color: theme.colors.text.primary,
    },
    historyMeta: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.light,
    },
    historyScore: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "bold",
      color: theme.colors.primary,
    },
  });
