import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../theme/theme";

interface Props {
  user: any;
  stats: any;
  reliabilityScore: number;
  onSettingsPress: () => void;
}

export default function ProfileHeader({
  user,
  stats,
  reliabilityScore,
  onSettingsPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const initials =
    (user?.firstName?.substring(0, 1) || "") +
    (user?.lastName?.substring(0, 1) || "");

  const getReliabilityTier = (score: number) => {
    if (score >= 90) return { label: "Excellent", color: "#10b981" };
    if (score >= 75) return { label: "Good", color: "#3b82f6" };
    if (score >= 60) return { label: "Fair", color: "#f59e0b" };
    return { label: "Low", color: "#ef4444" };
  };

  const tier = getReliabilityTier(reliabilityScore);

  return (
    <LinearGradient
      colors={["#4F46E5", "#6366F1", "#818CF8"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.gradientContainer,
        { paddingTop: Math.max(insets.top, 20) + 10 },
      ]}
    >
      <View style={styles.container}>
        <View style={styles.headerTop}>
          <View style={styles.userInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials || "??"}</Text>
            </View>
            <View style={styles.nameContainer}>
              <Text style={styles.name} numberOfLines={1}>
                {user?.firstName || "Learner"}
              </Text>
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>{stats?.level || "B1"}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            onPress={onSettingsPress}
            style={styles.settingsBtn}
          >
            <Ionicons name="settings-outline" size={24} color="white" />
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.streak || 0} 🔥</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: tier.color }]}>
              {tier.label}
            </Text>
            <Text style={styles.statLabel}>Reliability</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats?.totalSessions || 0}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientContainer: {
    paddingTop: 10,
    paddingBottom: 24,
    marginBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  container: {
    paddingHorizontal: 20,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  avatarText: {
    color: "white",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  nameContainer: {
    gap: 4,
  },
  name: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },
  levelBadge: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  levelText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "600",
  },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    color: "white",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 2,
  },
  statLabel: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
});
