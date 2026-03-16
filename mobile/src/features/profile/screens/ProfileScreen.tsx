import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { reliabilityApi, UserReliability } from "../../api/reliability";
import { useTheme } from "../../theme/ThemeProvider";
import { Theme } from "../../theme/types";

// ─── Setting Row ───────────────────────────────────────────
function SettingRow({
  icon,
  label,
  subtitle,
  onPress,
  rightElement,
  danger,
  theme,
}: {
  icon: string;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  danger?: boolean;
  theme: Theme;
}) {
  return (
    <TouchableOpacity
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 16,
      }}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: danger
            ? theme.colors.error + "12"
            : theme.colors.accent + "12",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Ionicons
          name={icon as any}
          size={20}
          color={danger ? theme.colors.error : theme.colors.accent}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 16,
            fontWeight: "500",
            color: danger ? theme.colors.error : theme.colors.text.primary,
          }}
        >
          {label}
        </Text>
        {subtitle && (
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.text.secondary,
              marginTop: 2,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {rightElement ||
        (onPress && (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={theme.colors.text.secondary}
          />
        ))}
    </TouchableOpacity>
  );
}

// ─── Section Divider ───────────────────────────────────────
function SectionHeader({ title, theme }: { title: string; theme: Theme }) {
  return (
    <Text
      style={{
        fontSize: 14,
        fontWeight: "700",
        color: theme.colors.text.secondary,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginBottom: 8,
        marginTop: 16,
        marginLeft: 4,
      }}
    >
      {title}
    </Text>
  );
}

// ─── Reliability Badge ─────────────────────────────────────
function ReliabilityBadge({ score }: { score: number }) {
  let color = "#6366F1";
  let label = "Reliable";
  let icon = "shield-checkmark";

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
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 9999,
        borderWidth: 1,
        gap: 4,
        backgroundColor: color + "15",
        borderColor: color + "30",
      }}
    >
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={{ fontSize: 12, fontWeight: "600", color }}>
        {score}% {label}
      </Text>
    </View>
  );
}

// ─── Main Component ────────────────────────────────────────
export default function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const { theme, setTheme, availableThemes } = useTheme();
  const navigation = useNavigation();
  const [signingOut, setSigningOut] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [practiceReminders, setPracticeReminders] = useState(true);
  const [reliability, setReliability] = useState<UserReliability | null>(null);

  const meta = (user?.unsafeMetadata || {}) as any;
  const name = user?.firstName || "User";
  const email = user?.primaryEmailAddress?.emailAddress || "";
  const initials = name.substring(0, 2).toUpperCase();

  useFocusEffect(
    React.useCallback(() => {
      if (user?.id) {
        reliabilityApi
          .getUserReliability(user.id)
          .then(setReliability)
          .catch((err) => console.error("Failed to fetch reliability", err));
      }
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

  const cardStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: theme.colors.border + "20",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  };

  const separatorStyle = {
    height: 1,
    backgroundColor: theme.colors.border + "30",
    marginLeft: 60,
  };

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.headerContainer}>
          <TouchableOpacity
            onPress={() => (navigation as any).goBack()}
            style={[
              styles.iconButton,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border + "20",
              },
            ]}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={theme.colors.text.primary}
            />
          </TouchableOpacity>
          <Text
            style={[styles.screenTitle, { color: theme.colors.text.primary }]}
          >
            Profile
          </Text>
          <TouchableOpacity
            onPress={() =>
              (navigation as any).navigate("MainTabs", { screen: "Home" })
            }
            style={[
              styles.iconButton,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border + "20",
              },
            ]}
          >
            <Ionicons
              name="home-outline"
              size={24}
              color={theme.colors.text.primary}
            />
          </TouchableOpacity>
        </View>

        {/* User Card */}
        <View
          style={[
            styles.userCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border + "20",
            },
          ]}
        >
          <LinearGradient
            colors={theme.gradients.primary as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarCircle}
          >
            <Text style={styles.avatarText}>{initials}</Text>
          </LinearGradient>
          <View style={styles.userInfo}>
            <Text
              style={[styles.nameText, { color: theme.colors.text.primary }]}
            >
              {name}
            </Text>
            {email ? (
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.text.secondary,
                  marginTop: 2,
                }}
              >
                {email}
              </Text>
            ) : null}

            <View style={styles.badgesRow}>
              <View
                style={[
                  styles.levelPill,
                  {
                    backgroundColor:
                      theme.tokens.level[
                        (
                          meta.assessmentLevel || "B1"
                        ).toLowerCase() as keyof typeof theme.tokens.level
                      ] || theme.colors.primary,
                  },
                ]}
              >
                <Ionicons name="trophy-outline" size={12} color="white" />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: "white",
                  }}
                >
                  {meta.assessmentCompleted
                    ? meta.assessmentLevel || "Assessed"
                    : "Not Assessed"}
                </Text>
              </View>
              {reliability && (
                <ReliabilityBadge score={reliability.reliabilityScore} />
              )}
            </View>
          </View>
        </View>

        {/* Theme Selection Section */}
        <SectionHeader title="Theme" theme={theme} />
        <View style={cardStyle}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.themeSelectorScroll}
          >
            {availableThemes.map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTheme(t.id)}
                style={[
                  styles.themeOption,
                  {
                    borderColor:
                      theme.id === t.id ? t.colors.accent : "transparent",
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
                        theme.id === t.id
                          ? t.colors.accent
                          : theme.colors.text.secondary,
                    },
                  ]}
                >
                  {t.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Account Section */}
        <SectionHeader title="Account" theme={theme} />
        <View style={cardStyle}>
          <SettingRow
            icon="person-outline"
            label="Edit Profile"
            subtitle={`${meta.goal || "No goal set"}`}
            theme={theme}
            onPress={() =>
              Alert.alert(
                "Coming Soon",
                "Edit profile will be available in the next update.",
              )
            }
          />
          <View style={separatorStyle} />
          <SettingRow
            icon="language-outline"
            label="Language"
            subtitle={meta.nativeLanguage || "Not set"}
            theme={theme}
            onPress={() =>
              Alert.alert("Coming Soon", "Language settings coming soon.")
            }
          />
        </View>

        {/* Notifications Section */}
        <SectionHeader title="Notifications" theme={theme} />
        <View style={cardStyle}>
          <SettingRow
            icon="notifications-outline"
            label="Push Notifications"
            subtitle="Get notified about calls and matches"
            theme={theme}
            rightElement={
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{
                  true: theme.colors.accent,
                  false: theme.colors.border,
                }}
                thumbColor={theme.colors.surface}
              />
            }
          />
          <View style={separatorStyle} />
          <SettingRow
            icon="alarm-outline"
            label="Practice Reminders"
            subtitle="Daily reminders to practice"
            theme={theme}
            rightElement={
              <Switch
                value={practiceReminders}
                onValueChange={setPracticeReminders}
                trackColor={{
                  true: theme.colors.accent,
                  false: theme.colors.border,
                }}
                thumbColor={theme.colors.surface}
              />
            }
          />
        </View>

        {/* App Section */}
        <SectionHeader title="App" theme={theme} />
        <View style={cardStyle}>
          <SettingRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            theme={theme}
            onPress={() => Linking.openURL("https://engr.app/privacy")}
          />
          <View style={separatorStyle} />
          <SettingRow
            icon="document-text-outline"
            label="Terms of Service"
            theme={theme}
            onPress={() => Linking.openURL("https://engr.app/terms")}
          />
          <View style={separatorStyle} />
          <SettingRow
            icon="help-circle-outline"
            label="Help & Support"
            theme={theme}
            onPress={() => Linking.openURL("mailto:support@engr.app")}
          />
          <View style={separatorStyle} />
          <SettingRow
            icon="construct-outline"
            label="Debug Socket"
            theme={theme}
            onPress={() => (navigation as any).navigate("SocketDebug")}
          />
          <View style={separatorStyle} />
          <SettingRow
            icon="star-outline"
            label="Rate the App"
            theme={theme}
            onPress={() =>
              Alert.alert("Thank you!", "We appreciate your support.")
            }
          />
        </View>

        {/* Danger Zone */}
        <SectionHeader title="Danger Zone" theme={theme} />
        <View style={cardStyle}>
          <SettingRow
            icon="log-out-outline"
            label="Sign Out"
            danger
            theme={theme}
            onPress={handleSignOut}
            rightElement={
              signingOut ? (
                <ActivityIndicator color={theme.colors.error} size="small" />
              ) : undefined
            }
          />
          <View style={separatorStyle} />
          <SettingRow
            icon="trash-outline"
            label="Delete Account"
            subtitle="Permanently delete your data"
            danger
            theme={theme}
            onPress={handleDeleteAccount}
          />
        </View>

        {/* App Version */}
        <Text
          style={[styles.versionText, { color: theme.colors.text.secondary }]}
        >
          EngR v1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles (layout-only, no theme colors) ─────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  iconButton: {
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "bold",
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    gap: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  userInfo: {
    flex: 1,
  },
  nameText: {
    fontSize: 20,
    fontWeight: "bold",
  },
  levelPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    gap: 4,
  },
  badgesRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
    flexWrap: "wrap",
  },
  versionText: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 32,
    opacity: 0.6,
  },
  themeSelectorScroll: {
    padding: 16,
    gap: 12,
  },
  themeOption: {
    width: 80,
    alignItems: "center",
    padding: 8,
    borderRadius: 12,
    borderWidth: 2,
  },
  themePreview: {
    width: 50,
    height: 50,
    borderRadius: 10,
    overflow: "hidden",
    padding: 6,
    gap: 4,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  themePreviewAccent: {
    width: "100%",
    height: 12,
    borderRadius: 4,
  },
  themePreviewDeep: {
    width: "60%",
    height: 12,
    borderRadius: 4,
  },
  themeLabel: {
    fontSize: 10,
    fontWeight: "700",
  },
});
