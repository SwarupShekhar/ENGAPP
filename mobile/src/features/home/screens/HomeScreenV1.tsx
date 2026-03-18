import { useUser } from "@clerk/clerk-expo";
import { useNavigation, useFocusEffect, useIsFocused } from "@react-navigation/native";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  Image,
  TextInput,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "../../../theme/useAppTheme";
import { Svg, Path, G, Circle } from "react-native-svg";
import { SemanticLevelBadge } from "../../../components/common/SemanticLevelBadge";
import { LevelType } from "../../../theme/semanticTokens";
import { ConnectPracticeCard } from "../../../components/home/ConnectPracticeCard";
import { FeedbackReadyCard } from "../../../components/home/FeedbackReadyCard";
import YourSkillsCard from "../../../components/home/YourSkillsCard";
import WeeklyActivityGrid from "../../../components/home/WeeklyActivityGrid";
import { ContextualCard } from "../../../components/home/ContextualCard";
import AnimatedScoreRing from "../../../components/home/AnimatedScoreRing";
import { userApi, UserStats } from "../../../api/user";
import { chatApi, connectionsApi } from "../../../api/connections";
import { getHomeData, HomeData } from "../services/homeApi";
import HomeMainCarousel from "../../../components/home/HomeMainCarousel";
import { PracticeNudgeCard } from "../../../components/home/PracticeNudgeCard";
import { tasksApi, LearningTask } from "../../../api/tasks";
import SocketService from "../../../features/call/services/socketService";
import { tokensV2 } from "../../../theme/tokensV2";
import Animated, {
  FadeIn,
  SlideInRight,
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedScrollHandler,
  useDerivedValue,
  useAnimatedStyle,
  useAnimatedProps,
  interpolate,
  Extrapolation,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";

// --- Local Elevated Components ---

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const AnimatedNumber = ({ 
  value, 
  style, 
  prefix = "", 
  suffix = "", 
  accessibilityLabel 
}: { 
  value: number; 
  style?: any; 
  prefix?: string; 
  suffix?: string;
  accessibilityLabel?: string;
}) => {
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    animatedValue.value = withSpring(value, { damping: 20, stiffness: 60 });
  }, [value]);

  const animatedProps = useAnimatedProps(() => {
    return {
      text: `${prefix}${Math.round(animatedValue.value)}${suffix}`,
    } as any;
  });

  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      value={`${prefix}${Math.round(value)}${suffix}`}
      style={[style, { paddingVertical: 0 }]}
      animatedProps={animatedProps}
      accessibilityLabel={accessibilityLabel || `${prefix}${value}${suffix}`}
    />
  );
};

const ScaleButton = ({ 
  children, 
  onPress, 
  style, 
  accessibilityLabel, 
  accessibilityRole = "button" 
}: { 
  children: React.ReactNode; 
  onPress?: () => void; 
  style?: any;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "header" | "link" | "menuitem" | "none";
}) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 20, stiffness: 300 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 20, stiffness: 300 });
  };

  return (
    <AnimatedTouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
    >
      {children}
    </AnimatedTouchableOpacity>
  );
};

const PulsingAvatar = ({ imageUrl, initial, theme }: { imageUrl?: string; initial: string; theme: any }) => {
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => getStyles(theme, insets), [theme, insets]);
  const pulse = useSharedValue(1);

  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      pulse.value = 1;
    }
  }, [isFocused]);

  const animatedRing = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: interpolate(pulse.value, [1, 1.08], [0.5, 0.2]),
  }));

  return (
    <View style={styles.avatarWrapper}>
      <Animated.View style={[styles.avatarPulseRing, animatedRing]} />
      <View style={styles.avatarMain}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarText}>{initial}</Text>
        )}
      </View>
    </View>
  );
};

const AnimatedPath = Animated.createAnimatedComponent(Path);

const GoalProgressBar = ({ current, target, label }: { current: number; target: number; label: string }) => {
  const percentage = Math.min((current / (target || 100)) * 100, 100);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(percentage / 100, { damping: 20, stiffness: 60 });
  }, [percentage]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 4 }}>
      <View style={{ flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
        <Animated.View style={[{ height: '100%', backgroundColor: 'white' }, animatedStyle]} />
      </View>
      <Text style={{ color: 'white', fontSize: 10, opacity: 0.7, fontWeight: '600' }}>
        {Math.round(percentage)}% to {label}
      </Text>
    </View>
  );
};

const Shimmer = ({ width, height, style }: { width: any; height: any; style?: any }) => {
  const shimmerValue = useSharedValue(-1);
  useEffect(() => {
    shimmerValue.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.linear }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmerValue.value, [-1, 1], [0.3, 0.7]),
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: 8,
        },
        style,
        animatedStyle,
      ]}
    />
  );
};

const SkeletonCard = () => (
  <View style={{ margin: 20, padding: 20, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }}>
    <Shimmer width="60%" height={24} style={{ marginBottom: 12, backgroundColor: 'rgba(0,0,0,0.05)' }} />
    <Shimmer width="90%" height={16} style={{ marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.05)' }} />
    <Shimmer width="80%" height={16} style={{ marginBottom: 20, backgroundColor: 'rgba(0,0,0,0.05)' }} />
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Shimmer width={100} height={40} style={{ borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.05)' }} />
      <Shimmer width={100} height={40} style={{ borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.05)' }} />
    </View>
  </View>
);

const SkeletonBanner = ({ theme, insets }: { theme: any; insets: any }) => (
  <View style={{ height: 320, backgroundColor: theme.colors.primary, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, paddingTop: insets.top + 10, paddingHorizontal: 20 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)' }} />
        <View style={{ gap: 4 }}>
          <Shimmer width={80} height={12} style={{ opacity: 0.3 }} />
          <Shimmer width={120} height={20} style={{ opacity: 0.4 }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)' }} />
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)' }} />
      </View>
    </View>
    <View style={{ alignItems: 'center', gap: 8 }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, borderWidth: 8, borderColor: 'rgba(255,255,255,0.1)' }} />
      <Shimmer width={60} height={10} style={{ opacity: 0.3 }} />
    </View>
  </View>
);

export default function HomeScreen() {
  const { user, isLoaded } = useUser();
  const navigation: any = useNavigation();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => getStyles(theme, insets), [theme, insets]);
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);
  const [pendingTasks, setPendingTasks] = useState<LearningTask[]>([]);
  const [loading, setLoading] = useState(true);

  const HERO_HEIGHT = 210;
  const BANNER_HEIGHT = 310 + insets.top;
  const SCROLL_THRESHOLD = 150;

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const bannerTranslateY = useDerivedValue(() =>
    interpolate(
      scrollY.value,
      [0, SCROLL_THRESHOLD],
      [0, -HERO_HEIGHT - 100],
      Extrapolation.CLAMP
    )
  );

  const bannerScale = useDerivedValue(() =>
    interpolate(
      scrollY.value,
      [-50, 0, SCROLL_THRESHOLD],
      [1.02, 1, 0.93],
      Extrapolation.CLAMP
    )
  );

  const bannerOpacity = useDerivedValue(() =>
    interpolate(scrollY.value, [SCROLL_THRESHOLD * 0.4, SCROLL_THRESHOLD * 0.8], [1, 0], Extrapolation.CLAMP)
  );

  const miniBarOpacity = useDerivedValue(() =>
    interpolate(scrollY.value, [SCROLL_THRESHOLD * 0.6, SCROLL_THRESHOLD], [0, 1], Extrapolation.CLAMP)
  );

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: bannerTranslateY.value },
      { scale: bannerScale.value }
    ],
    zIndex: 10,
  }));

  const bannerContentOpacity = useDerivedValue(() =>
    interpolate(scrollY.value, [SCROLL_THRESHOLD * 0.4, SCROLL_THRESHOLD], [1, 0], Extrapolation.CLAMP)
  );

  const bannerContentStyle = useAnimatedStyle(() => ({
    opacity: bannerContentOpacity.value,
  }));

  const miniButtonStyle = useAnimatedStyle(() => ({
    opacity: miniBarOpacity.value,
    transform: [{ translateY: interpolate(scrollY.value, [SCROLL_THRESHOLD * 0.7, SCROLL_THRESHOLD], [10, 0], Extrapolation.CLAMP) }],
  }));

  const borderPulse = useSharedValue(0.2);

  useEffect(() => {
    if (homeData?.header?.dailyGoalDone === 0) {
      borderPulse.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.2, { duration: 1500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      borderPulse.value = 0.2;
    }
  }, [homeData?.header?.dailyGoalDone]);

  const borderPulseStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(255, 255, 255, ${borderPulse.value})`,
  }));

  useEffect(() => {
    if (isLoaded && user && !user.firstName) {
      navigation.replace("CreateProfile");
    }
  }, [isLoaded, user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      const fetchData = async () => {
        try {
          // 1. Instant load from local cache
          const cachedHome = await AsyncStorage.getItem("@home_data_cache");
          const cachedPending = await AsyncStorage.getItem("@home_pending_task_cache");
          if (cachedHome) {
            setHomeData(JSON.parse(cachedHome));
            setLoading(false);
          }
          if (cachedPending) {
            try {
              const parsed = JSON.parse(cachedPending) as LearningTask;
              if (parsed?.id) setPendingTasks([parsed]);
            } catch (_) {
              // ignore invalid cache
            }
          }

          // 2. Fresh data
          const [homeDataResp, unreadData, pendingReqs, pendingTasksResp] = await Promise.all([
            getHomeData(),
            chatApi.getUnreadCount(),
            connectionsApi.getPendingRequests(),
            tasksApi.getPendingTasks().catch((err) => {
              if (__DEV__) console.error("[HomeScreen] getPendingTasks failed:", err);
              return [];
            }),
          ]);

          setHomeData(homeDataResp);
          setUnreadCount(unreadData.count || 0);
          const pendingCount = Array.isArray(pendingReqs)
            ? pendingReqs.length
            : 0;
          setNotifCount(pendingCount);
          setPendingTasks(pendingTasksResp);
          if (pendingTasksResp.length > 0) {
            AsyncStorage.setItem("@home_pending_task_cache", JSON.stringify(pendingTasksResp[0]));
          } else {
            AsyncStorage.removeItem("@home_pending_task_cache");
          }

          AsyncStorage.setItem(
            "@home_data_cache",
            JSON.stringify(homeDataResp),
          );
          AsyncStorage.setItem(
            "@home_unread_cache",
            JSON.stringify(unreadData.count || 0),
          );
          AsyncStorage.setItem(
            "@home_notif_cache",
            JSON.stringify(pendingCount),
          );
        } catch (error) {
          if (__DEV__) console.error("Failed to fetch home data:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchData();

      // Real-time unread count listener
      const handleNewMessage = (data: any) => {
        console.log(
          "[HomeScreen] Real-time message received, updating unread counts",
        );
        // Re-fetch only unread counts and pending requests to minimize overhead
        Promise.all([
          chatApi.getUnreadCount(),
          connectionsApi.getPendingRequests(),
        ])
          .then(([unreadData, pendingReqs]) => {
            setUnreadCount(unreadData.count || 0);
            setNotifCount(Array.isArray(pendingReqs) ? pendingReqs.length : 0);
          })
          .catch((err) => {
            if (__DEV__) console.warn("[HomeScreen] Real-time fetch error:", err);
          });
      };

      const socketSrv = SocketService.getInstance();
      socketSrv.onNewMessage(handleNewMessage);

      return () => {
        socketSrv.offNewMessage(handleNewMessage);
      };
    }, [user]),
  );

  const handleCTAAction = useCallback((action: string, data?: any) => {
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
        if (__DEV__) console.log("Unhandled action:", action, data);
    }
  }, [navigation]);

  if (!isLoaded || loading || !homeData) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8F9FE' }}>
        <StatusBar style="light" />
        <SkeletonBanner theme={theme} insets={insets} />
        <ScrollView style={{ flex: 1, marginTop: -40 }} showsVerticalScrollIndicator={false}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ScrollView>
      </View>
    );
  }

  const { header, skills, contextualCards } = homeData;

  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor={theme.colors.primary} />
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        {/* Unified Banner (Header + Hero) */}
        <Animated.View style={[styles.bannerContainer, bannerStyle, { top: 0 }]}>
          <LinearGradient
            colors={theme.colors.gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderBottomLeftRadius: 40, borderBottomRightRadius: 40 }]}
          />
          <Animated.View style={[bannerContentStyle, { flex: 1, paddingTop: insets.top + 10 }]}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <PulsingAvatar imageUrl={user?.imageUrl} initial={header.userName.charAt(0)} theme={theme} />
                <View style={{ flexShrink: 1 }}><Text style={styles.greetingSmall}>Welcome back,</Text><Text style={styles.greeting} numberOfLines={1}>{header.userName} 👋</Text></View>
              </View>
              <View style={styles.headerRight}>{header.streak > 0 && (
                  <View style={styles.streakBadge} accessibilityLabel={`Current streak: ${header.streak} days`}>
                    <Text style={styles.streakEmoji} aria-hidden>🔥</Text>
                    <AnimatedNumber value={header.streak} style={styles.streakText} accessibilityLabel={`${header.streak} days`} />
                  </View>
                )}<ScaleButton
                  style={styles.notifBtn}
                  onPress={() => { navigation.navigate("Conversations"); }}
                  accessibilityLabel="Open Chat"
                ><Ionicons name="chatbox-ellipses-outline" size={22} color="white" />{unreadCount > 0 && (
                    <View style={styles.badge} accessibilityLabel={`${unreadCount} unread messages`}><Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text></View>
                  )}</ScaleButton><ScaleButton
                  style={styles.notifBtn}
                  onPress={() => { navigation.navigate("Notifications"); }}
                  accessibilityLabel="Open Notifications"
                ><Ionicons name="notifications-outline" size={22} color="white" />{notifCount > 0 && (
                    <View style={styles.badge} accessibilityLabel={`${notifCount} new notifications`}><Text style={styles.badgeText}>{notifCount > 9 ? "9+" : notifCount}</Text></View>
                  )}</ScaleButton></View>
            </View>
            <View style={styles.heroContent}>
              <View style={styles.scoreRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() =>
                    navigation.navigate("ScoreDetail", {
                      score: header.score,
                      level: header.level,
                      skills: skills,
                      percentile: header.percentile,
                      pendingTaskType: pendingTasks?.[0]?.type,
                    })
                  }
                  style={styles.ringWrapper}
                >
                  <AnimatedScoreRing score={header.score} size={88} />
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={styles.ringLabel}>Overall</Text>
                    <Ionicons
                      name="information-circle-outline"
                      size={12}
                      color="white"
                      style={{ opacity: 0.6 }}
                    />
                  </View>
                </TouchableOpacity>
              </View>
              <View style={styles.levelRow}>
                <View 
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, marginRight: 16 }} 
                  accessibilityLabel={`Level ${header.level || ''}, ${header.percentile || ''}`}
                >
                  <SemanticLevelBadge level={(header.level?.toLowerCase() || "a1") as LevelType} pattern="tinted" size="small" />
                  {header.percentile && (
                    <View style={styles.percentileBadge}><Text style={styles.percentileText}>{header.percentile}</Text></View>
                  )}
                  <GoalProgressBar current={header.score} target={header.goalTarget || 100} label={header.goalLabel || "Next Level"} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {header.latestAssessmentId && (
                    <ScaleButton 
                      style={styles.retakeBtn} 
                      onPress={() => navigation.navigate("AssessmentResult", { sessionId: header.latestAssessmentId })}
                      accessibilityLabel="View latest assessment results"
                    >
                      <Ionicons name="stats-chart" size={12} color="white" />
                      <Text style={styles.retakeText}>Results</Text>
                    </ScaleButton>
                  )}
                  <ScaleButton 
                    style={styles.retakeBtn} 
                    onPress={() => navigation.navigate("AssessmentIntro")}
                    accessibilityLabel="Retake English proficiency assessment"
                  >
                    <Ionicons name="refresh" size={12} color="white" />
                    <Text style={styles.retakeText}>Retake</Text>
                  </ScaleButton>
                </View>
              </View>
            </View>
          </Animated.View>
        </Animated.View>

        {/* Content */}
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: BANNER_HEIGHT + 8 }]}
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
          onScroll={scrollHandler}
          scrollEventThrottle={Platform.OS === 'ios' ? 16 : 32}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => {
                if (__DEV__) console.log("Trigger refresh");
              }}
              tintColor={theme.colors.primary}
            />
          }
        >
          {/* Main Carousel */}
          <Animated.View entering={FadeInDown.delay(100).springify()} style={{ marginBottom: 20 }}>
            <HomeMainCarousel />
          </Animated.View>

          {/* Skill Matrix */}
          <Animated.View entering={FadeInUp.delay(200).springify()} style={{ marginBottom: 20 }}>
            <YourSkillsCard 
              grammar={skills.scores.grammar || 0} 
              pronunciation={skills.scores.pronunciation || 0} 
              fluency={skills.scores.fluency || 0} 
              vocabulary={skills.scores.vocabulary || 0} 
              avgScore={skills.avgScore} 
              deltaLabel={skills.deltaLabel} 
              details={skills.details} 
            />
          </Animated.View>

          {/* Weekly Activity */}
          <Animated.View entering={FadeInUp.delay(300).springify()} style={{ marginBottom: 20 }}>
            <WeeklyActivityGrid activity={homeData.weeklyActivity} />
          </Animated.View>

          {/* Practice nudge: at most one pending task */}
          {pendingTasks.length > 0 && (
            <Animated.View entering={FadeInUp.delay(350).springify()} style={{ marginBottom: 20 }}>
              <PracticeNudgeCard
                task={pendingTasks[0]}
                onPress={(task) => navigation.navigate("PracticeTask", { task })}
              />
            </Animated.View>
          )}

          {/* Contextual Cards */}
          {contextualCards.map((card, idx) => (
            <Animated.View 
              key={`${card.type}-${idx}`} 
              entering={FadeInUp.delay(400 + idx * 100).springify()} 
              style={{ marginBottom: 20 }}
            >
              <ContextualCard type={card.type} data={card.data} index={idx} onPress={handleCTAAction} />
            </Animated.View>
          ))}

          {/* Feedback Card (Legacy fallback) */}
          {!contextualCards.some((c) => c.type === "weekly_progress") && (
            <Animated.View entering={FadeInUp.delay(500).springify()} style={{ marginBottom: 20 }}>
              <FeedbackReadyCard onPress={() => navigation.navigate("Feedback")} overallScore={skills.avgScore} />
            </Animated.View>
          )}
          <View style={styles.footerSpacer} />
        </Animated.ScrollView>

        {/* Mini Sticky Bar */}
        <Animated.View style={[styles.miniBarContainer, miniButtonStyle]}>
          <BlurView intensity={80} tint={(theme.theme as any).dark ? "dark" : "light"} style={[styles.miniBarBlur, borderPulseStyle]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingBottom: header.xpToday > 0 ? 2 : 0 }}>
              {/* LEFT: Score + Trend */}
              <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 60 }}>
                <AnimatedNumber value={header.score} style={styles.miniScore} />
                {header.scoreDelta !== undefined && (header.scoreDelta as number) !== 0 && (
                  <Text style={{ fontSize: 16, marginLeft: 4, color: (header.scoreDelta as number) > 0 ? '#4ADE80' : '#F87171', fontWeight: 'bold' }}>
                    {(header.scoreDelta as number) > 0 ? '↑' : '↓'}
                  </Text>
                )}
              </View>

              {/* CENTER: Daily Progress */}
              <View style={styles.miniCenter}>
                {(header.dailyGoalDone ?? 0) >= (header.dailyGoalTarget || 3) ? (
                  <Ionicons name="checkmark-circle" size={18} color="#4ADE80" />
                ) : (
                  <View style={{ flexDirection: 'row', gap: 2, marginBottom: 2 }}>
                    {[1, 2, 3].map((i) => (
                      <Text 
                        key={i} 
                        style={{ 
                          fontSize: 14, 
                          color: i <= (header.dailyGoalDone ?? 0) ? 'white' : 'rgba(255,255,255,0.3)',
                          includeFontPadding: false,
                        }}
                      >
                        {i <= (header.dailyGoalDone ?? 0) ? '●' : '○'}
                      </Text>
                    ))}
                  </View>
                )}
                <Text style={styles.miniLevel}>{(header.dailyGoalDone ?? 0)}/{(header.dailyGoalTarget || 3)} today</Text>
              </View>

              {/* RIGHT: Streak */}
              <View style={styles.miniStreak}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.miniStreakText}>🔥 </Text>
                  <AnimatedNumber 
                    value={header.streak || 0} 
                    style={[
                      styles.miniScore, 
                      { 
                        fontSize: 18, 
                        color: header.streak >= 7 ? '#4ADE80' : 
                               header.streak >= 3 ? '#FB923C' : 
                               'white' 
                      }
                    ]} 
                  />
                </View>
              </View>
            </View>

            {/* XP ROW */}
            {header.xpToday > 0 && (
              <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: '800', textAlign: 'center', marginTop: -2 }}>
                ⚡ {header.xpToday} XP TODAY
              </Text>
            )}
          </BlurView>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const getStyles = (theme: any, insets: any) =>
  StyleSheet.create({
    loadingRoot: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.colors.background,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: "#6B7280",
    },
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    safeArea: {
      flex: 1,
    },
    bannerContainer: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 310 + insets.top,
      zIndex: 10,
    },
    headerFixed: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
    },
    headerGradient: {
      paddingBottom: theme.spacing.s,
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: theme.spacing.l,
      paddingTop: theme.spacing.s,
      paddingBottom: theme.spacing.m,
      overflow: "visible",
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flexShrink: 1,
      marginRight: 8,
    },
    avatarImage: {
      width: "100%",
      height: "100%",
    },
    avatarText: {
      color: "white",
      fontWeight: "bold",
      fontSize: 18,
    },
    greetingSmall: {
      fontSize: 12,
      color: "rgba(255,255,255,0.7)",
      fontWeight: "500",
    },
    greeting: {
      fontSize: 20,
      fontWeight: "800",
      color: "white",
      letterSpacing: -0.5,
    },
    avatarWrapper: {
      position: "relative",
      width: 46,
      height: 46,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarPulseRing: {
      position: "absolute",
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: "white",
    },
    avatarMain: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(255,255,255,0.25)",
      justifyContent: "center",
      alignItems: "center",
      overflow: "hidden",
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.5)",
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexShrink: 0,
    },
    scoreRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing.m,
      marginTop: theme.spacing.s,
      marginBottom: theme.spacing.s,
    },
    ringWrapper: {
      alignItems: "center",
      gap: 4,
    },
    ringLabel: {
      color: "rgba(255,255,255,0.6)",
      fontSize: 10,
      fontWeight: "700",
      marginTop: 2,
    },
    goalProgressBar: {
      flex: 1,
      height: 6,
      backgroundColor: "rgba(255,255,255,0.15)",
      borderRadius: 3,
      overflow: "hidden",
    },
    goalBarContainer: {
      flex: 1,
      marginLeft: theme.spacing.l,
    },
    streakBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.2)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      gap: 4,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
    },
    streakEmoji: {
      fontSize: 14,
    },
    streakText: {
      color: "white",
      fontSize: 13,
      fontWeight: "700",
    },
    notifBtn: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.2)",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
      position: "relative",
    },
    badge: {
      position: "absolute",
      top: -4,
      right: -4,
      backgroundColor: theme.colors.error,
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 4,
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
    },
    badgeText: {
      color: "white",
      fontSize: 10,
      fontWeight: "bold",
    },
    levelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.l,
      marginTop: theme.spacing.s,
    },
    levelBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "rgba(255,255,255,0.18)",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.25)",
    },
    levelText: {
      color: "white",
      fontSize: 13,
      fontWeight: "700",
    },
    percentileBadge: {
      backgroundColor: "rgba(255,255,255,0.15)",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    percentileText: {
      color: "white",
      fontSize: 11,
      fontWeight: "600",
    },
    retakeBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(255,255,255,0.15)",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.2)",
    },
    retakeText: {
      color: "white",
      fontSize: 11,
      fontWeight: "600",
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingTop: theme.spacing.s,
      paddingBottom: theme.spacing.xl,
    },
    ctaContainer: {
      marginHorizontal: theme.spacing.l,
      marginBottom: theme.spacing.l,
    },
    mainCTA: {
      borderRadius: 28,
      overflow: "hidden",
      ...theme.shadows.large,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
    },
    ctaBlur: {
      width: "100%",
    },
    ctaContent: {
      padding: 24,
    },
    ctaTextSection: {
      marginBottom: 20,
    },
    ctaTitle: {
      fontSize: 26,
      fontWeight: "800",
      marginBottom: 10,
      letterSpacing: -0.8,
      textAlign: "left",
    },
    ctaDesc: {
      fontSize: 16,
      lineHeight: 22,
      opacity: 0.8,
      textAlign: "left",
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      gap: 12,
    },
    flagBadge: {
      position: "absolute",
      top: -2,
      right: -2,
      backgroundColor: "white",
      width: 14,
      height: 14,
      borderRadius: 7,
      justifyContent: "center",
      alignItems: "center",
      elevation: 2,
    },
    ctaButtonPremium: {
      flex: 1,
      height: 56,
      borderRadius: 28,
      overflow: "hidden",
    },
    buttonInner: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    ctaButtonText: {
      color: "white",
      fontWeight: "700",
      fontSize: 18,
      letterSpacing: -0.2,
    },
    soundwaves: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      marginLeft: 10,
    },
    wave: {
      width: 2,
      backgroundColor: "rgba(255,255,255,0.5)",
      borderRadius: 1,
    },
    mayaChipContainerCentered: {
      width: "100%",
      borderTopWidth: 1,
      paddingVertical: 14,
      alignItems: "center",
      backgroundColor: "rgba(255,255,255,0.1)",
    },
    mayaChipSimple: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    mayaChipText: {
      fontSize: 15,
      fontWeight: "700",
      letterSpacing: -0.3,
    },
    footerSpacer: {
      height: 120,
    },
    cardContainer: {
      marginHorizontal: theme.spacing.l,
      marginBottom: theme.spacing.m,
      borderRadius: tokensV2.borderRadius.xl,
      overflow: "hidden",
      ...tokensV2.shadows.violet,
    },
    contextualWrapper: {
      marginTop: theme.spacing.s,
    },
    heroContainer: {
      position: "absolute",
      height: 300,
      left: 0,
      right: 0,
      backgroundColor: "transparent",
      overflow: "hidden",
    },
    heroContent: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.l,
      paddingTop: 12,
      paddingBottom: 40,
    },
    miniBarContainer: {
      position: "absolute",
      top: insets.top + 10,
      left: 20,
      right: 20,
      height: 54,
      zIndex: 20,
    },
    miniBarBlur: {
      flex: 1,
      borderRadius: 27,
      justifyContent: "center",
      paddingHorizontal: 20,
      overflow: "hidden",
      borderWidth: 1.5,
      borderColor: "rgba(255,255,255,0.2)",
    },
    miniScore: {
      fontSize: 22,
      fontWeight: "800",
      color: theme.colors.text.primary,
    },
    miniLevel: {
      fontSize: 13,
      color: theme.colors.text.secondary || "rgba(0,0,0,0.6)",
    },
    miniCenter: {
      flex: 1,
      alignItems: "center",
    },
    miniStreak: {
      alignItems: "flex-end",
    },
    miniStreakText: {
      fontSize: 12,
      color: theme.colors.text.secondary || "rgba(0,0,0,0.6)",
    },
  });
