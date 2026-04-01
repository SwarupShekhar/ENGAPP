import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import Animated, { Easing, SlideInDown } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useUser } from "@clerk/clerk-expo";
import { LinearGradient } from "expo-linear-gradient";
import { tokensV2_603010 as tokensV2 } from "../../../theme/tokensV2_603010";
import { matchmakingApi } from "../../../api/matchmaking";

type CallType = "random" | "group";
type Gender = "any" | "male" | "female";

export default function CallPreferenceScreenV2() {
  const navigation: any = useNavigation();
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const [callType, setCallType] = useState<CallType>("random");
  const [gender, setGender] = useState<Gender>("any");
  const [isSearching, setIsSearching] = useState(false);
  const [showAiOption, setShowAiOption] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const meta = (user?.unsafeMetadata || {}) as any;
  const userLevel = meta.assessmentLevel || "B1";

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
      matchmakingApi.leave(user.id, userLevel).catch((err) => {
        console.log("[Matchmaking] Silent leave error:", err);
      });
    }
  };

  useEffect(() => {
    return () => cleanupMatchmaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      Alert.alert("Matchmaking failed", "Please try again.");
    }
  };

  const handleCancelSearch = () => {
    setIsSearching(false);
    cleanupMatchmaking();
  };

  return (
    <View style={[styles.screenWrapper, { backgroundColor: "transparent" }]}>
      {/* Background blur + dismiss */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.05)" }]}>
        <BlurView
          intensity={40}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          blurReductionFactor={4}
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => navigation.goBack()}
        />
      </View>

      <Animated.View
        entering={SlideInDown.duration(400).easing(Easing.out(Easing.quad))}
        style={[
          styles.container,
          Platform.select({
            ios: { shadowOpacity: 0.25 },
          }),
        ]}
      >
        <View style={styles.grabber} />

        <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
          <View style={styles.header}>
            <Text style={styles.title}>Call Preference</Text>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={tokensV2.colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.description}>
              Private session with another learner for focused practice.
            </Text>

            <View style={styles.warningBox}>
              <Ionicons name="warning" size={16} color={tokensV2.colors.accentAmber} />
              <Text style={styles.warningText}>
                Using English throughout the call is required. Be respectful!
              </Text>
            </View>

            <Text style={styles.label}>Type</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  callType === "random" && styles.typeBtnActive,
                ]}
                onPress={() => setCallType("random")}
              >
                <Ionicons name="shuffle" size={14} color={callType === "random" ? tokensV2.colors.primaryViolet : tokensV2.colors.textSecondary} />
                <Text style={[styles.btnText, callType === "random" && styles.btnTextActive]}>
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
                <Ionicons name="people" size={14} color={callType === "group" ? "#3B82F6" : tokensV2.colors.textSecondary} />
                <Text style={[styles.btnText, callType === "group" && styles.btnTextGroupActive]}>
                  Group
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Gender</Text>
            <View style={styles.row}>
              {(["any", "male", "female"] as Gender[]).map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderBtn, gender === g && styles.genderBtnActive]}
                  onPress={() => setGender(g)}
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

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <TouchableOpacity
              style={[styles.primaryBtn, isSearching && { opacity: 0.85 }]}
              onPress={handleFindLearner}
              activeOpacity={0.8}
              disabled={isSearching}
            >
              {!isSearching ? (
                <LinearGradient
                  colors={tokensV2.gradients.callButton as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
              ) : null}

              <View style={styles.primaryBtnContent} pointerEvents="none">
                {isSearching ? (
                  <ActivityIndicator color={tokensV2.colors.textPrimary} size="small" />
                ) : showAiOption ? (
                  <View style={styles.primaryBtnRow}>
                    <Ionicons name="sparkles" size={20} color={tokensV2.colors.textPrimary} />
                    <Text style={styles.primaryBtnText}>Practice with Maya (AI)</Text>
                  </View>
                ) : (
                  <View style={styles.primaryBtnRow}>
                    <Ionicons name="search" size={20} color={tokensV2.colors.textPrimary} />
                    <Text style={styles.primaryBtnText}>Find My Co-learner</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {!isSearching && !showAiOption ? (
              <TouchableOpacity
                style={styles.aiTutorLink}
                onPress={() => {
                  navigation.goBack();
                  setTimeout(() => navigation.navigate("AITutor"), 100);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="sparkles" size={16} color={tokensV2.colors.primaryViolet} />
                <Text style={styles.aiTutorLinkText}>Or practice with AI Tutor</Text>
              </TouchableOpacity>
            ) : null}

            {isSearching ? (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancelSearch}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancel Search</Text>
              </TouchableOpacity>
            ) : null}

            {showAiOption && !isSearching ? (
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
            ) : null}
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
  container: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: "62%",
    width: "100%",
    paddingTop: 6,
    overflow: "hidden",
    backgroundColor: "rgba(10,10,20,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.12,
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
    backgroundColor: "rgba(226,232,240,0.75)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
  },
  title: {
    color: tokensV2.colors.textPrimary,
    fontSize: 20,
    fontWeight: "900",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 2,
  },
  description: {
    color: tokensV2.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
    fontWeight: "700",
  },
  warningBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(197,232,77,0.10)",
    borderColor: "rgba(197,232,77,0.22)",
    borderWidth: 1,
    padding: 12,
    borderRadius: 14,
    marginBottom: 18,
    alignItems: "flex-start",
  },
  warningText: {
    flex: 1,
    color: tokensV2.colors.textPrimary,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  label: {
    color: tokensV2.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  typeBtnActive: {
    borderColor: "rgba(197,232,77,0.40)",
    backgroundColor: "rgba(197,232,77,0.14)",
  },
  typeBtnGroupActive: {
    borderColor: "rgba(59,130,246,0.55)",
    backgroundColor: "rgba(59,130,246,0.14)",
  },
  btnText: {
    color: tokensV2.colors.textSecondary,
    fontSize: 13,
    fontWeight: "800",
  },
  btnTextActive: {
    color: tokensV2.colors.primaryViolet,
  },
  btnTextGroupActive: {
    color: "#3B82F6",
  },
  genderBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  genderBtnActive: {
    borderColor: "rgba(197,232,77,0.40)",
    backgroundColor: "rgba(197,232,77,0.12)",
  },
  genderText: {
    color: tokensV2.colors.textSecondary,
    fontSize: 13,
    fontWeight: "800",
  },
  genderTextActive: {
    color: tokensV2.colors.accentAmber,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    justifyContent: "center",
    paddingHorizontal: 12,
    ...Platform.select({
      ios: { shadowOpacity: 0.25 },
    }),
  },
  primaryBtnContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryBtnText: {
    color: tokensV2.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
  },
  aiTutorLink: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
  },
  aiTutorLinkText: {
    color: tokensV2.colors.primaryViolet,
    fontSize: 13,
    fontWeight: "800",
  },
  cancelBtn: {
    marginTop: 10,
    alignItems: "center",
    paddingVertical: 6,
  },
  cancelBtnText: {
    color: tokensV2.colors.textSecondary,
    fontWeight: "900",
  },
  retryBtn: {
    marginTop: 10,
    alignItems: "center",
    paddingVertical: 6,
  },
  retryBtnText: {
    color: tokensV2.colors.primaryViolet,
    fontWeight: "900",
    textDecorationLine: "underline",
  },
});

