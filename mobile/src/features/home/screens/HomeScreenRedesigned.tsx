import { useUser } from "@clerk/clerk-expo";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  StatusBar,
  RefreshControl,
  Text,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppTheme } from "../../theme/useAppTheme";
import { getHomeData, HomeData } from "../services/homeApi";
import { chatApi, connectionsApi } from "../api/connections";

// Redesigned Components
import PremiumHeader from "../../components/redesigned/PremiumHeader";
import PremiumCTACard from "../../components/redesigned/PremiumCTACard";
import PremiumSkillsCard, {
  SkillData,
} from "../../components/redesigned/PremiumSkillsCard";
import ContextualCardList, {
  ContextualCard,
} from "../../components/redesigned/ContextualCardList";
import WeeklyActivityGrid from "../../components/home/WeeklyActivityGrid";

export default function HomeScreenRedesigned() {
  const { user, isLoaded } = useUser();
  const navigation: any = useNavigation();
  const { theme } = useAppTheme();

  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);

    try {
      // 1. Instant load from local cache if not refreshing
      if (!isRefresh) {
        const cachedHome = await AsyncStorage.getItem("@home_data_cache");
        if (cachedHome) {
          setHomeData(JSON.parse(cachedHome));
          setLoading(false);
        }
      }

      // 2. Fresh data
      const [homeDataResp, unreadData, pendingReqs] = await Promise.all([
        getHomeData(),
        chatApi.getUnreadCount(),
        connectionsApi.getPendingRequests(),
      ]);

      setHomeData(homeDataResp);
      setUnreadCount(unreadData.count || 0);
      const pendingCount = Array.isArray(pendingReqs) ? pendingReqs.length : 0;
      setNotifCount(pendingCount);

      AsyncStorage.setItem("@home_data_cache", JSON.stringify(homeDataResp));
    } catch (error) {
      console.error("Failed to fetch home data:", error);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [user]),
  );

  const handleRefresh = () => fetchData(true);

  const handleCTAAction = (action: string, data?: any) => {
    switch (action) {
      case "navigate_to_practice":
        navigation.navigate("CallPreference");
        break;
      case "start_maya_session":
        navigation.navigate("AITutor");
        break;
      case "start_assessment":
        navigation.navigate("AssessmentIntro");
        break;
      case "open_maya_chat":
        navigation.navigate("AITutor");
        break;
      default:
        console.log("Unhandled action:", action, data);
    }
  };

  useEffect(() => {
    if (isLoaded && user && !user.firstName) {
      navigation.replace("CreateProfile");
    }
  }, [isLoaded, user]);

  if (!isLoaded || !homeData) return null;

  const { header, primaryCTA, skills, contextualCards, weeklyActivity } =
    homeData;

  // Transform skills data for PremiumSkillsCard
  const transformedSkills: SkillData[] = [
    {
      name: "Grammar",
      icon: "Aa",
      score: skills.scores.grammar || 0,
      delta: skills.deltas.grammar || 0,
      color: theme.colors.skill.grammar,
    },
    {
      name: "Pronunciation",
      icon: "🎤",
      score: skills.scores.pronunciation || 0,
      delta: skills.deltas.pronunciation || 0,
      color: theme.colors.skill.pronunciation,
    },
    {
      name: "Fluency",
      icon: "💧",
      score: skills.scores.fluency || 0,
      delta: skills.deltas.fluency || 0,
      color: theme.colors.skill.fluency,
    },
    {
      name: "Vocabulary",
      icon: "📚",
      score: skills.scores.vocabulary || 0,
      delta: skills.deltas.vocabulary || 0,
      color: theme.colors.skill.vocabulary,
    },
  ];

  // Transform contextual cards
  const transformedContextual: ContextualCard[] = contextualCards.map(
    (c, idx) => ({
      id: `${c.type}-${idx}`,
      type: c.type as any,
      title: c.data.title || "Notification",
      description: c.data.message || c.data.description || "",
      icon: c.data.icon || "🔔",
      actionLabel: c.data.buttonText || c.data.actionLabel,
      onPress: () => handleCTAAction(c.data.action || "default"),
    }),
  );

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <StatusBar
        barStyle={theme.variation === "deep" ? "light-content" : "dark-content"}
      />

      <ScrollView
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <PremiumHeader
          userName={header.userName}
          greeting={header.greeting}
          level={header.level}
          score={header.score}
          streak={header.streak}
          goalTarget={header.goalTarget || 100}
          goalLabel={header.goalLabel || "Next Milestone"}
          unreadCount={unreadCount}
          notifCount={notifCount}
          onChatPress={() => navigation.navigate("Conversations")}
          onNotifPress={() => navigation.navigate("Notifications")}
        />

        <PremiumCTACard
          title={primaryCTA.title}
          description={primaryCTA.description}
          buttonText={primaryCTA.buttonText}
          onPress={() => handleCTAAction(primaryCTA.action, primaryCTA.data)}
          showMayaChip={!!primaryCTA.mayaChip}
          onMayaPress={() => handleCTAAction(primaryCTA.mayaChip.action)}
        />

        <PremiumSkillsCard
          skills={transformedSkills}
          avgScore={skills.avgScore}
          deltaLabel={skills.deltaLabel}
        />

        {/* Weekly Activity Grid - Reusing existing but wrapping in a card style */}
        <View
          style={[
            styles.activityCard,
            {
              backgroundColor: theme.colors.surface,
              ...theme.shadows.md,
            },
          ]}
        >
          <Text
            style={[styles.sectionTitle, { color: theme.colors.text.primary }]}
          >
            Activity
          </Text>
          <WeeklyActivityGrid activity={weeklyActivity} />
        </View>

        <ContextualCardList cards={transformedContextual} />

        <View style={styles.footerSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  activityCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 20,
    borderRadius: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    letterSpacing: -0.4,
  },
  footerSpacer: {
    height: 100,
  },
});
