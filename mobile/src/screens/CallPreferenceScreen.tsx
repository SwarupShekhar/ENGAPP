import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useUser } from "@clerk/clerk-expo";
import { theme } from "../theme/theme";
import { matchmakingApi } from "../api/matchmaking";

type CallType = "random" | "group";
type Gender = "any" | "male" | "female";

export default function CallPreferenceScreen() {
  const navigation: any = useNavigation();
  const { user } = useUser();
  const [callType, setCallType] = useState<CallType>("random");
  const [gender, setGender] = useState<Gender>("any");
  const [isSearching, setIsSearching] = useState(false);
  const [showAiOption, setShowAiOption] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    cleanupMatchmaking();
    setIsSearching(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <Text style={styles.title}>Call Preference</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.closeBtn}
        >
          <Ionicons
            name="close"
            size={24}
            color={theme.colors.text.secondary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.description}>
          Connect in a private session with another learner for focused English
          conversation.
        </Text>

        <View style={styles.warningBox}>
          <Ionicons
            name="warning"
            size={20}
            color={theme.colors.warning}
            style={{ marginTop: 2 }}
          />
          <Text style={styles.warningText}>
            Using English throughout the call is required to help both learners
            improve. Be respectful!
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
              size={18}
              color={
                callType === "random"
                  ? theme.colors.primary
                  : theme.colors.text.secondary
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
              size={18}
              color={
                callType === "group" ? "#3B82F6" : theme.colors.text.secondary
              }
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
              style={[styles.genderBtn, gender === g && styles.genderBtnActive]}
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

        <View style={{ flex: 1 }} />

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
              <Text style={styles.actionBtnText}>Searching for Partner...</Text>
            </>
          ) : showAiOption ? (
            <>
              <Ionicons
                name="sparkles"
                size={20}
                color="white"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.actionBtnText}>Practice with Maya (AI)</Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.l,
    paddingTop: theme.spacing.m,
    marginBottom: theme.spacing.m,
  }, // ... styles continue (truncated for conciseness in plan, but will be full in file)
  title: {
    fontSize: theme.typography.sizes.l,
    fontWeight: "bold",
    color: theme.colors.text.primary,
  },
  closeBtn: {
    padding: 4,
    backgroundColor: theme.colors.surface, // slight grey
    borderRadius: 12,
  },
  content: {
    paddingHorizontal: theme.spacing.l,
    paddingBottom: theme.spacing.xl,
    flexGrow: 1,
  },
  description: {
    fontSize: theme.typography.sizes.m,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.l,
    lineHeight: 22,
  },
  warningBox: {
    flexDirection: "row",
    backgroundColor: "#FEF3C7", // Yellow-100
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.m,
    gap: theme.spacing.s,
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: "#92400E", // Amber-800
    lineHeight: 18,
  },
  label: {
    fontSize: theme.typography.sizes.m,
    fontWeight: "600",
    marginBottom: theme.spacing.s,
    color: theme.colors.text.primary,
  },
  row: {
    flexDirection: "row",
    gap: theme.spacing.m,
    marginBottom: theme.spacing.xl,
  },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: theme.borderRadius.m,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: "white",
    gap: 8,
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
    paddingVertical: 12,
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
    fontWeight: "500",
    color: theme.colors.text.secondary,
  },
  genderTextActive: {
    color: theme.colors.primary,
    fontWeight: "600",
  },
  actionBtn: {
    backgroundColor: "#1D4ED8", // Blue-700 matches mock
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: theme.borderRadius.l,
    marginTop: theme.spacing.l,
    ...theme.shadows.primaryGlow,
  },
  actionBtnText: {
    color: "white",
    fontSize: theme.typography.sizes.m,
    fontWeight: "bold",
  },
  aiTutorLink: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: theme.spacing.m,
    paddingVertical: theme.spacing.s,
  },
  aiTutorLinkText: {
    color: "#8B5CF6",
    fontSize: theme.typography.sizes.m,
    fontWeight: "600",
  },
  cancelBtn: {
    marginTop: theme.spacing.m,
    alignItems: "center",
    paddingVertical: theme.spacing.s,
  },
  cancelBtnText: {
    color: theme.colors.text.secondary,
    fontWeight: "600",
    fontSize: theme.typography.sizes.m,
  },
  retryBtn: {
    marginTop: theme.spacing.m,
    alignItems: "center",
    paddingVertical: theme.spacing.s,
  },
  retryBtnText: {
    color: theme.colors.primary,
    fontWeight: "600",
    fontSize: theme.typography.sizes.m,
    textDecorationLine: "underline",
  },
});
