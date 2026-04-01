import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Linking,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useTheme } from "../../../theme/ThemeProvider";
import { tokensV2_603010 as tokensV2 } from "../../../theme/tokensV2_603010";
import { useUIVariant } from "../../../context/UIVariantContext";
import { reliabilityApi, type UserReliability } from "../../../api/reliability";

const GlassCard = ({ children, style }: { children: React.ReactNode; style?: any }) => (
  <BlurView intensity={80} tint="dark" style={[styles.glassCard, style]}>
    {children}
  </BlurView>
);

function SettingRowV2({
  icon,
  label,
  subtitle,
  onPress,
  rightElement,
  danger,
}: {
  icon: string;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  danger?: boolean;
}) {
  const dangerColor = "#FF6B6B";
  const accent = tokensV2.colors.primaryViolet;

  return (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      disabled={!onPress}
    >
      <View
        style={[
          styles.iconBubble,
          {
            backgroundColor: danger
              ? "rgba(255,107,107,0.14)"
              : "rgba(197,232,77,0.16)",
          },
        ]}
      >
        <Ionicons
          name={icon as any}
          size={20}
          color={danger ? dangerColor : accent}
        />
      </View>

      <View style={styles.settingTextWrap}>
        <Text
          style={[
            styles.settingLabel,
            { color: danger ? dangerColor : tokensV2.colors.textPrimary },
          ]}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text style={styles.settingSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {rightElement ? (
        rightElement
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color={tokensV2.colors.textSecondary} />
      ) : null}
    </TouchableOpacity>
  );
}

function SectionHeaderV2({ title }: { title: string }) {
  return (
    <Text style={styles.sectionHeader} accessibilityRole="header">
      {title}
    </Text>
  );
}

function ReliabilityBadgeV2({ score }: { score: number }) {
  let color = "#6366F1";
  let label = "Reliable";
  let icon: any = "shield-checkmark";

  if (score >= 90) {
    color = "#10b981";
    label = "Excellent";
    icon = "star";
  } else if (score >= 75) {
    color = "#3b82f6";
    label = "Good";
    icon = "shield-checkmark";
  } else if (score >= 60) {
    color = "#f59e0b";
    label = "Fair";
    icon = "alert-circle";
  } else {
    color = "#ef4444";
    label = "Low";
    icon = "warning";
  }

  return (
    <View
      style={[
        styles.reliabilityBadge,
        { backgroundColor: `${color}15`, borderColor: `${color}30` },
      ]}
    >
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.reliabilityText, { color }]}>
        {score}% {label}
      </Text>
    </View>
  );
}

export default function ProfileScreenV2() {
  const navigation: any = useNavigation();
  const { user } = useUser();
  const { signOut } = useAuth();
  const { theme: currentTheme, setTheme, availableThemes } = useTheme();
  const { variant, setVariant } = useUIVariant();

  const [signingOut, setSigningOut] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [practiceReminders, setPracticeReminders] = useState(true);
  const [reliability, setReliability] = useState<UserReliability | null>(null);

  const meta = (user?.unsafeMetadata || {}) as any;
  const name = user?.firstName || "User";
  const email = user?.primaryEmailAddress?.emailAddress || "";
  const initials = useMemo(() => (name || "U").substring(0, 2).toUpperCase(), [name]);
  const assessmentLevel = meta.assessmentLevel || "B1";
  const reliabilityScore = reliability?.reliabilityScore ?? null;

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      reliabilityApi
        .getUserReliability(user.id)
        .then(setReliability)
        .catch((err: any) => console.error("Failed to fetch reliability", err));
    }, [user?.id]),
  );

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
          } catch (err) {
            console.error(err);
          } finally {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This action is permanent and cannot be undone. All your data will be lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Contact Support",
              "Please email support@engr.app to delete your account.",
            );
          },
        },
      ],
    );
  };

  const levelKey = (assessmentLevel || "B1").toLowerCase() as keyof typeof currentTheme.tokens.level;
  const levelBg = currentTheme.tokens.level[levelKey] || tokensV2.colors.primaryViolet;

  return (
    <View style={styles.root}>
      {/* Aurora background */}
      <View style={styles.auroraContainer} pointerEvents="none">
        <LinearGradient
          colors={["rgba(197,232,77,0.14)", "transparent"] as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.auroraLeft}
        />
        <LinearGradient
          colors={["rgba(30,17,40,0.95)", "transparent"] as any}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.auroraRight}
        />
      </View>

      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.headerIconBtn}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color={tokensV2.colors.textPrimary} />
            </TouchableOpacity>

            <Text style={styles.screenTitle}>Profile</Text>

            <TouchableOpacity
              onPress={() => navigation.navigate("MainTabs", { screen: "Home" })}
              style={styles.headerIconBtn}
              accessibilityLabel="Go home"
            >
              <Ionicons name="home-outline" size={22} color={tokensV2.colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* User Card */}
          <GlassCard style={styles.userCard}>
            <LinearGradient
              colors={[tokensV2.colors.primaryViolet, tokensV2.colors.accentMint] as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarCircle}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>

            <View style={styles.userInfo}>
              <Text style={styles.userName}>{name}</Text>
              {email ? <Text style={styles.userEmail}>{email}</Text> : null}

              <View style={styles.badgesRow}>
                <View style={[styles.levelPill, { backgroundColor: levelBg }]}>
                  <Ionicons name="trophy-outline" size={12} color="#fff" />
                  <Text style={styles.levelPillText}>
                    {meta.assessmentCompleted ? assessmentLevel : "Not Assessed"}
                  </Text>
                </View>

                {reliabilityScore != null ? <ReliabilityBadgeV2 score={reliabilityScore} /> : null}
              </View>
            </View>
          </GlassCard>

          {/* Experimental */}
          <SectionHeaderV2 title="Experimental" />
          <GlassCard style={styles.sectionCard}>
            <SettingRowV2
              icon="flask-outline"
              label="New UI (Beta)"
              subtitle="Preview the redesigned experience"
              rightElement={
                <Switch
                  value={variant === "v2"}
                  onValueChange={(val) => setVariant(val ? "v2" : "v1")}
                  trackColor={{ true: tokensV2.colors.primaryViolet, false: "rgba(255,255,255,0.18)" }}
                  thumbColor={tokensV2.colors.textPrimary}
                />
              }
            />
          </GlassCard>

          {/* Theme */}
          <SectionHeaderV2 title="Theme" />
          <GlassCard style={styles.sectionCard}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.themeSelectorScroll}
            >
              {availableThemes.map((t: any) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setTheme(t.id)}
                  style={[
                    styles.themeOption,
                    {
                      borderColor: currentTheme.id === t.id ? tokensV2.colors.accentMint : "rgba(255,255,255,0.10)",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.themePreview,
                      { backgroundColor: t.colors.background },
                    ]}
                  >
                    <View
                      style={[
                        styles.themePreviewAccent,
                        { backgroundColor: t.colors.accent },
                      ]}
                    />
                    <View
                      style={[
                        styles.themePreviewDeep,
                        { backgroundColor: t.colors.deep },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.themeLabel,
                      {
                        color:
                          currentTheme.id === t.id
                            ? t.colors.accent
                            : tokensV2.colors.textSecondary,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {t.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </GlassCard>

          {/* Account */}
          <SectionHeaderV2 title="Account" />
          <GlassCard style={styles.sectionCard}>
            <SettingRowV2
              icon="person-outline"
              label="Edit Profile"
              subtitle={`${meta.goal || "No goal set"}`}
              onPress={() =>
                Alert.alert("Coming Soon", "Edit profile will be available in the next update.")
              }
            />
            <View style={styles.separator} />
            <SettingRowV2
              icon="language-outline"
              label="Language"
              subtitle={meta.nativeLanguage || "Not set"}
              onPress={() => Alert.alert("Coming Soon", "Language settings coming soon.")}
            />
          </GlassCard>

          {/* Notifications */}
          <SectionHeaderV2 title="Notifications" />
          <GlassCard style={styles.sectionCard}>
            <SettingRowV2
              icon="notifications-outline"
              label="Push Notifications"
              subtitle="Get notified about calls and matches"
              rightElement={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  trackColor={{ true: tokensV2.colors.accentMint, false: "rgba(255,255,255,0.18)" }}
                  thumbColor={tokensV2.colors.textPrimary}
                />
              }
            />
            <View style={styles.separator} />
            <SettingRowV2
              icon="alarm-outline"
              label="Practice Reminders"
              subtitle="Daily reminders to practice"
              rightElement={
                <Switch
                  value={practiceReminders}
                  onValueChange={setPracticeReminders}
                  trackColor={{ true: tokensV2.colors.primaryViolet, false: "rgba(255,255,255,0.18)" }}
                  thumbColor={tokensV2.colors.textPrimary}
                />
              }
            />
          </GlassCard>

          {/* App */}
          <SectionHeaderV2 title="App" />
          <GlassCard style={styles.sectionCard}>
            <SettingRowV2
              icon="shield-checkmark-outline"
              label="Privacy Policy"
              onPress={() => Linking.openURL("https://engr.app/privacy")}
            />
            <View style={styles.separator} />
            <SettingRowV2
              icon="document-text-outline"
              label="Terms of Service"
              onPress={() => Linking.openURL("https://engr.app/terms")}
            />
            <View style={styles.separator} />
            <SettingRowV2
              icon="help-circle-outline"
              label="Help & Support"
              onPress={() => Linking.openURL("mailto:support@engr.app")}
            />
            <View style={styles.separator} />
            <SettingRowV2
              icon="construct-outline"
              label="Debug Socket"
              onPress={() => navigation.navigate("SocketDebug")}
            />
            <View style={styles.separator} />
            <SettingRowV2
              icon="star-outline"
              label="Rate the App"
              onPress={() => Alert.alert("Thank you!", "We appreciate your support.")}
            />
          </GlassCard>

          {/* Danger zone */}
          <SectionHeaderV2 title="Danger Zone" />
          <GlassCard style={styles.sectionCard}>
            <SettingRowV2
              icon="log-out-outline"
              label="Sign Out"
              danger
              onPress={handleSignOut}
              rightElement={
                signingOut ? (
                  <ActivityIndicator size="small" color="#FF6B6B" />
                ) : null
              }
            />
            <View style={styles.separator} />
            <SettingRowV2
              icon="trash-outline"
              label="Delete Account"
              subtitle="Permanently delete your data"
              danger
              onPress={handleDeleteAccount}
            />
          </GlassCard>

          <Text style={styles.versionText}>EngR v1.0.0</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokensV2.colors.background,
  },
  safeArea: { flex: 1 },
  auroraContainer: {
    ...StyleSheet.absoluteFillObject,
    height: 520,
  },
  auroraLeft: {
    position: "absolute",
    left: -120,
    top: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
  },
  auroraRight: {
    position: "absolute",
    right: -120,
    top: -60,
    width: 360,
    height: 360,
    borderRadius: 180,
  },
  glassCard: {
    borderRadius: tokensV2.borderRadius.l,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  scrollContent: {
    paddingTop: 18,
    paddingHorizontal: tokensV2.spacing.m,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: {
    color: tokensV2.colors.textPrimary,
    fontSize: 22,
    fontWeight: "900",
  },
  userCard: {
    padding: 16,
    marginBottom: 18,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
  },
  userInfo: { flex: 1 },
  userName: {
    color: tokensV2.colors.textPrimary,
    fontSize: 18,
    fontWeight: "900",
  },
  userEmail: {
    color: tokensV2.colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "700",
  },
  badgesRow: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" },
  levelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  levelPillText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  reliabilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  reliabilityText: { fontSize: 12, fontWeight: "800" },
  sectionHeader: {
    marginTop: 18,
    color: tokensV2.colors.textSecondary,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  sectionCard: {
    padding: 6,
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 14,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  settingTextWrap: { flex: 1 },
  settingLabel: { fontSize: 16, fontWeight: "800" },
  settingSubtitle: {
    color: tokensV2.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    fontWeight: "700",
  },
  separator: { height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginLeft: 54 },
  themeSelectorScroll: { paddingHorizontal: 8, paddingVertical: 4, gap: 12 },
  themeOption: {
    width: 92,
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginRight: 8,
  },
  themePreview: {
    width: 54,
    height: 54,
    borderRadius: 16,
    overflow: "hidden",
    padding: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 8,
  },
  themePreviewAccent: { width: "100%", height: 10, borderRadius: 10 },
  themePreviewDeep: { width: "60%", height: 10, borderRadius: 10, opacity: 0.95 },
  themeLabel: { fontSize: 10, fontWeight: "900", textAlign: "center" },
  versionText: { textAlign: "center", color: tokensV2.colors.textSecondary, fontSize: 12, fontWeight: "800", marginTop: 6, opacity: 0.7 },
});

