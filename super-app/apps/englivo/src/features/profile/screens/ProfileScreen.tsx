import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useAppTheme } from "../../../theme/useAppTheme";
import { getMe, getHistory } from "../../../api/user";
import { User, SessionHistory } from "../../../types/user";

export default function ProfileScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const { signOut } = useAuth();
  const { user: clerkUser } = useUser();

  const [userData, setUserData] = useState<User | null>(null);
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [me, hist] = await Promise.all([getMe(), getHistory()]);
      setUserData(me);
      setHistory(Array.isArray(hist) ? hist : []);
    } catch (e) {
      console.warn("[ProfileScreen] load error:", e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
          } catch (e) {
            console.error("[ProfileScreen] signOut error:", e);
          }
        },
      },
    ]);
  };

  const displayName =
    userData?.firstName ||
    clerkUser?.firstName ||
    "Learner";
  const email =
    userData?.email ||
    clerkUser?.primaryEmailAddress?.emailAddress ||
    "";
  const cefrLevel = userData?.cefrLevel || "A1";
  const streak = userData?.streakDays || 0;
  const totalMinutes = userData?.totalMinutes || 0;
  const totalHours = (totalMinutes / 60).toFixed(1);
  const safeHistory = Array.isArray(history) ? history : [];
  const aiSessions = safeHistory.filter((h) => h.type === "AI").length;
  const humanSessions = safeHistory.filter((h) => h.type === "HUMAN").length;

  const openUrl = async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert("Unavailable", "This link is not available right now.");
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      console.warn("[ProfileScreen] failed to open URL:", e);
      Alert.alert("Error", "Could not open link.");
    }
  };

  const MenuItem = ({
    icon,
    label,
    onPress,
    danger = false,
  }: {
    icon: string;
    label: string;
    onPress?: () => void;
    danger?: boolean;
  }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Ionicons
        name={icon as any}
        size={22}
        color={danger ? "#F87171" : theme.colors.text.secondary}
      />
      <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>
        {label}
      </Text>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.colors.text.light}
      />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Avatar + Name */}
        <LinearGradient
          colors={theme.colors.gradients.surface as any}
          style={styles.profileHeader}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.email}>{email}</Text>
          <View style={styles.cefrBadge}>
            <Text style={styles.cefrText}>{cefrLevel}</Text>
          </View>
        </LinearGradient>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Ionicons name="flame" size={22} color="#F59E0B" />
            <Text style={styles.statValue}>{streak}</Text>
            <Text style={styles.statLabel}>Streak</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="time-outline" size={22} color={theme.colors.primary} />
            <Text style={styles.statValue}>{totalHours}h</Text>
            <Text style={styles.statLabel}>Hours</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="hardware-chip-outline" size={22} color="#26A69A" />
            <Text style={styles.statValue}>{aiSessions}</Text>
            <Text style={styles.statLabel}>AI Sessions</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="person-outline" size={22} color="#5C6BC0" />
            <Text style={styles.statValue}>{humanSessions}</Text>
            <Text style={styles.statLabel}>Human</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Account</Text>
          <MenuItem
            icon="mail-outline"
            label={email || "Email"}
            onPress={() =>
              email
                ? openUrl(`mailto:${email}`)
                : Alert.alert("Email", "No email address available.")
            }
          />
          <MenuItem
            icon="trophy-outline"
            label={`CEFR Level: ${cefrLevel}`}
            onPress={() =>
              Alert.alert("CEFR Level", `Your current level is ${cefrLevel}.`)
            }
          />
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>General</Text>
          <MenuItem
            icon="notifications-outline"
            label="Notifications"
            onPress={() =>
              Alert.alert("Notifications", "Notification settings coming soon.")
            }
          />
          <MenuItem
            icon="help-circle-outline"
            label="Help & Support"
            onPress={() => openUrl("mailto:support@englivo.com")}
          />
          <MenuItem
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => openUrl("https://englivo.com/terms")}
          />
          <MenuItem
            icon="shield-outline"
            label="Privacy Policy"
            onPress={() => openUrl("https://englivo.com/privacy")}
          />
        </View>

        <View style={styles.menuSection}>
          <MenuItem
            icon="log-out-outline"
            label="Sign Out"
            onPress={handleLogout}
            danger
          />
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    centered: { justifyContent: "center", alignItems: "center" },
    profileHeader: {
      alignItems: "center",
      paddingVertical: theme.spacing.xl,
      paddingHorizontal: theme.spacing.m,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.colors.primary,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: theme.spacing.m,
      ...theme.shadows.primaryGlow,
    },
    avatarText: {
      fontSize: theme.typography.sizes.xxl,
      fontWeight: "black",
      color: "#0F172A",
    },
    displayName: {
      fontSize: theme.typography.sizes.xl,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    email: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
      marginTop: 4,
    },
    cefrBadge: {
      marginTop: theme.spacing.s,
      backgroundColor: theme.colors.primary,
      paddingHorizontal: theme.spacing.m,
      paddingVertical: 4,
      borderRadius: theme.borderRadius.circle,
    },
    cefrText: {
      color: "#0F172A",
      fontWeight: "bold",
      fontSize: theme.typography.sizes.s,
    },
    statsRow: {
      flexDirection: "row",
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.m,
      gap: theme.spacing.s,
    },
    statBox: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.l,
      padding: theme.spacing.m,
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    statValue: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    statLabel: {
      fontSize: 10,
      color: theme.colors.text.light,
      textAlign: "center",
    },
    menuSection: {
      marginHorizontal: theme.spacing.m,
      marginTop: theme.spacing.m,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden",
    },
    menuSectionTitle: {
      fontSize: theme.typography.sizes.xs,
      fontWeight: "bold",
      color: theme.colors.text.light,
      paddingHorizontal: theme.spacing.m,
      paddingTop: theme.spacing.m,
      paddingBottom: theme.spacing.s,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.m,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      gap: theme.spacing.m,
    },
    menuLabel: {
      flex: 1,
      fontSize: theme.typography.sizes.m,
      color: theme.colors.text.primary,
    },
    menuLabelDanger: {
      color: "#F87171",
    },
  });
