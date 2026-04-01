import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Platform,
} from "react-native";
import Animated, { SlideInDown, FadeIn, Easing } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useUser } from "@clerk/clerk-expo";
import { useAppTheme } from "../../../theme/useAppTheme";
import { matchmakingApi } from "../../../api/matchmaking";

type CallType = "random" | "group";
type Gender = "any" | "male" | "female";

export default function CallPreferenceScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation: any = useNavigation();
  const { user } = useUser();
  const [callType, setCallType] = useState<CallType>("random");
  const [gender, setGender] = useState<Gender>("any");
  const [isSearching, setIsSearching] = useState(false);
  const [showAiOption, setShowAiOption] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const insets = useSafeAreaInsets();
  const meta = (user?.unsafeMetadata || {}) as any;
  const userLevel = meta.assessmentLevel || "B1";

  useEffect(() => {
    return () => {
      cleanupMatchmaking();
    };
  }, []);

  const cleanupMatchmaking = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    
    // Proactively leave queue on the server
    if (user) {
      matchmakingApi.leave(user.id, userLevel).catch(err => 
        console.log('[Matchmaking] Silent leave error:', err)
      );
    }
  };

  const handleFindLearner = async () => {
    if (!user) return;

    if (showAiOption) {
      navigation.goBack();
      setTimeout(() => navigation.navigate("AITutor"), 100);
      return;
    }

    cleanupMatchmaking();
    setIsSearching(true);
    setShowAiOption(false);

    try {
      await matchmakingApi.join({
        userId: user.id,
        englishLevel: userLevel,
        topic: "General Practice",
      });

      pollIntervalRef.current = setInterval(async () => {
        try {
          const status = await matchmakingApi.checkStatus(user.id, userLevel);
          if (status.matched && status.sessionId) {
            cleanupMatchmaking();
            setIsSearching(false);
            navigation.replace("InCall", {
              sessionId: status.sessionId,
              roomName: status.roomName,
              partnerId: status.partnerId,
              partnerName: status.partnerName,
              topic: "General Practice",
            });
          } else if (status.message) {
            cleanupMatchmaking();
            setIsSearching(false);
            setShowAiOption(true);
          }
        } catch (error) {
          console.error("[Matchmaking] Poll error:", error);
        }
      }, 3000);

      safetyTimeoutRef.current = setTimeout(() => {
        cleanupMatchmaking();
        if (isSearching) {
          setIsSearching(false);
          setShowAiOption(true);
        }
      }, 45000);
    } catch (error) {
      console.error("[Matchmaking] Join failed:", error);
      setIsSearching(false);
      cleanupMatchmaking();
    }
  };

  const handleCancelSearch = () => {
    setIsSearching(false);
    cleanupMatchmaking();
  };

  return (
    <View style={[styles.screenWrapper, { backgroundColor: "transparent" }]}>
      {/* ── REAL NATIVE BLUR STACK ── */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(0,0,0,0.05)" },
        ]}
      >
        {/* Layer 1: Seamless Glass Blur (Mimicking CustomTabBar props) */}
        <BlurView
          intensity={40}
          tint="light"
          experimentalBlurMethod="dimezisBlurView"
          blurReductionFactor={4}
          style={StyleSheet.absoluteFill}
        />

        {/* Layer 2: Subtle Tint Overlay for Glass Depth */}
        <Pressable
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: "rgba(0,0,0,0.1)",
          }}
          onPress={() => navigation.goBack()}
        />
      </View>

      <Animated.View
        entering={SlideInDown.duration(400).easing(Easing.out(Easing.quad))}
        style={styles.container}
      >
        {/* ── Content ── */}
        <View style={styles.grabber} />
        <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
          <View style={styles.header}>
            <Text style={styles.title}>Call Preference</Text>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.description}>
              Private session with another learner for focused practice.
            </Text>

            <View style={styles.warningBox}>
              <Ionicons
                name="warning"
                size={16}
                color={theme.colors.warning}
                style={{ marginTop: 1 }}
              />
              <Text style={styles.warningText}>
                Using English throughout the call is required. Be respectful!
              </Text>
            </View>

            {/* Type Selection */}
            <Text style={styles.label}>Type</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  callType === "random" && styles.typeBtnActive,
                ]}
                onPress={() => setCallType("random")}
              >
                <Ionicons
                  name="shuffle"
                  size={14}
                  color={
                    callType === "random" ? theme.colors.primary : "#64748B"
                  }
                />
                <Text
                  style={[
                    styles.btnText,
                    callType === "random" && styles.btnTextActive,
                  ]}
                >
                  Random Match
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  callType === "group" && styles.typeBtnGroupActive,
                ]}
                onPress={() => setCallType("group")}
              >
                <Ionicons
                  name="people"
                  size={14}
                  color={callType === "group" ? "#3B82F6" : "#64748B"}
                />
                <Text
                  style={[
                    styles.btnText,
                    callType === "group" && styles.btnTextGroupActive,
                  ]}
                >
                  Group
                </Text>
              </TouchableOpacity>
            </View>

            {/* Gender Selection */}
            <Text style={styles.label}>Gender</Text>
            <View style={styles.row}>
              {["any", "male", "female"].map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.genderBtn,
                    gender === g && styles.genderBtnActive,
                  ]}
                  onPress={() => setGender(g as Gender)}
                >
                  <Text
                    style={[
                      styles.genderText,
                      gender === g && styles.genderTextActive,
                    ]}
                  >
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Fixed Footer for Action Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.actionBtn, isSearching && { opacity: 0.8 }]}
              onPress={handleFindLearner}
              activeOpacity={0.8}
              disabled={isSearching}
            >
              {isSearching ? (
                <>
                  <ActivityIndicator
                    color="white"
                    size="small"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.actionBtnText}>Searching...</Text>
                </>
              ) : showAiOption ? (
                <>
                  <Ionicons
                    name="sparkles"
                    size={20}
                    color="white"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.actionBtnText}>
                    Practice with Maya (AI)
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name="search"
                    size={20}
                    color="white"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.actionBtnText}>Find My Co-learner</Text>
                </>
              )}
            </TouchableOpacity>

            {!isSearching && !showAiOption && (
              <TouchableOpacity
                style={styles.aiTutorLink}
                onPress={() => {
                  navigation.goBack();
                  setTimeout(() => navigation.navigate("AITutor"), 100);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="sparkles" size={16} color="#8B5CF6" />
                <Text style={styles.aiTutorLinkText}>
                  Or practice with AI Tutor
                </Text>
              </TouchableOpacity>
            )}

            {isSearching && (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancelSearch}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancel Search</Text>
              </TouchableOpacity>
            )}

            {showAiOption && !isSearching && (
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => {
                  setShowAiOption(false);
                  handleFindLearner();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.retryBtnText}>Or try searching again</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    screenWrapper: {
      flex: 1,
      backgroundColor: "transparent",
      justifyContent: "flex-end",
    },
    container: {
      backgroundColor: "white", // Restored to solid white as requested
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      height: "62%",
      width: "100%",
      paddingTop: 4,
      overflow: "hidden",
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -10 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
        },
        android: {
          elevation: 20,
        },
      }),
    },
    grabber: {
      width: 36,
      height: 4,
      backgroundColor: "#E2E8F0",
      borderRadius: 2,
      alignSelf: "center",
      marginTop: 8,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: theme.spacing.l,
      paddingTop: theme.spacing.m,
      paddingBottom: theme.spacing.xs,
    },
    footer: {
      paddingHorizontal: theme.spacing.l,
      paddingBottom: theme.spacing.m,
      paddingTop: 0,
      backgroundColor: "white",
    },
    content: {
      paddingHorizontal: theme.spacing.l,
      paddingTop: 2,
      paddingBottom: theme.spacing.s,
    },
    title: {
      fontSize: 20, // Reduced from theme.l
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    closeBtn: {
      padding: 4,
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
    },
    description: {
      fontSize: 13, // Reduced
      color: theme.colors.text.secondary,
      marginBottom: theme.spacing.s,
      lineHeight: 18,
    },
    warningBox: {
      flexDirection: "row",
      backgroundColor: "#FEF3C750",
      padding: 10, // Reduced from theme.m
      borderRadius: theme.borderRadius.m,
      gap: theme.spacing.s,
      marginBottom: theme.spacing.s,
      borderWidth: 1,
      borderColor: "#FDE68A40",
    },
    warningText: {
      flex: 1,
      fontSize: 12, // Reduced
      color: "#92400E",
      lineHeight: 16,
    },
    label: {
      fontSize: 14, // Reduced
      fontWeight: "600",
      marginBottom: 6,
      color: theme.colors.text.primary,
    },
    row: {
      flexDirection: "row",
      gap: theme.spacing.s,
      marginBottom: theme.spacing.m,
    },
    typeBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10, // Reduced
      borderRadius: theme.borderRadius.m,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: "white",
      gap: 6,
    },
    typeBtnActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary + "08",
    },
    typeBtnGroupActive: {
      borderColor: "#3B82F6",
      backgroundColor: "#3B82F608",
    },
    btnText: {
      fontSize: 13, // Added
      fontWeight: "500",
      color: theme.colors.text.secondary,
    },
    btnTextActive: {
      color: theme.colors.primary,
      fontWeight: "600",
    },
    btnTextGroupActive: {
      color: "#3B82F6",
      fontWeight: "600",
    },
    genderBtn: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10, // Reduced
      borderRadius: theme.borderRadius.circle,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: "white",
    },
    genderBtnActive: {
      borderColor: theme.colors.primary,
      backgroundColor: "white",
    },
    genderText: {
      fontSize: 13, // Added
      fontWeight: "500",
      color: theme.colors.text.secondary,
    },
    genderTextActive: {
      color: theme.colors.primary,
      fontWeight: "600",
    },
    actionBtn: {
      backgroundColor: "#1D4ED8",
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      paddingVertical: 14, // Reduced
      borderRadius: theme.borderRadius.l,
      marginTop: 4,
      marginBottom: 8,
      ...theme.shadows.primaryGlow,
    },
    actionBtnText: {
      color: "white",
      fontSize: 15, // Reduced
      fontWeight: "bold",
    },
    aiTutorLink: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 6,
      paddingVertical: 4,
    },
    aiTutorLinkText: {
      color: "#8B5CF6",
      fontSize: 14,
      fontWeight: "600",
    },
    cancelBtn: {
      marginTop: 4,
      alignItems: "center",
      paddingVertical: 4,
    },
    cancelBtnText: {
      color: theme.colors.text.secondary,
      fontWeight: "600",
      fontSize: 14,
    },
    retryBtn: {
      marginTop: 4,
      alignItems: "center",
      paddingVertical: 4,
    },
    retryBtnText: {
      color: theme.colors.primary,
      fontWeight: "600",
      fontSize: 14,
      textDecorationLine: "underline",
    },
  });
