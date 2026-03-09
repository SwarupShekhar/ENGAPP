import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { useAppTheme } from "../../theme/useAppTheme";
import { useNavigation } from "@react-navigation/native";
import { getPhraseOfTheDay } from "../../data/phraseOfTheDay";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_MARGIN = 20;
const CARD_WIDTH = SCREEN_WIDTH - CARD_MARGIN * 2;
const CAROUSEL_HEIGHT = 280;

const PROMPT_CHIPS = [
  "Correct my sentence",
  "Roleplay a job interview",
  "Explain a grammar rule",
];

const HomeMainCarousel = () => {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation<any>();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const autoAdvanceRef = useRef<NodeJS.Timeout | null>(null);

  // Phrase of the day: from phrases.json, changes daily, no repeat for 200 days
  const dailyPhrase = useMemo(() => getPhraseOfTheDay(), []);

  // Pulse animation for "LIVE NOW"
  const pulseOpacity = useSharedValue(0.4);
  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.4, { duration: 800 }),
      ),
      -1,
      true,
    );
  }, []);

  const animatedPulse = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // Auto-advance logic
  const startAutoAdvance = () => {
    stopAutoAdvance();
    autoAdvanceRef.current = setInterval(() => {
      const nextIndex = (activeIndex + 1) % 3;
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }, 5000);
  };

  const stopAutoAdvance = () => {
    if (autoAdvanceRef.current) {
      clearInterval(autoAdvanceRef.current);
    }
  };

  useEffect(() => {
    startAutoAdvance();
    return () => stopAutoAdvance();
  }, [activeIndex]);

  const onMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / CARD_WIDTH);
    setActiveIndex(index);
  };

  const onScrollBeginDrag = () => {
    stopAutoAdvance();
  };

  const renderSlide = ({ index }: { index: number }) => {
    let gradientColors: readonly [string, string, ...string[]];
    switch (index) {
      case 0:
        gradientColors = ["#FFFDF2", "#FFF9E6"] as const;
        return (
          <LinearGradient colors={gradientColors} style={styles.slide}>
            <View style={styles.tagRow}>
              <View style={[styles.tag, { backgroundColor: "#FEF3C7" }]}>
                <Text style={[styles.tagText, { color: "#D97706" }]}>
                  PHRASE OF THE DAY
                </Text>
              </View>
              <View style={[styles.accentIcon, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="chatbubbles" size={20} color="#D97706" />
              </View>
            </View>
            <View style={styles.contentColumn}>
              <Text style={styles.headline} numberOfLines={2}>
                {dailyPhrase.phrase}
              </Text>
              <Text style={styles.subheadline} numberOfLines={2}>
                {dailyPhrase.meaning}
              </Text>
              <View style={styles.phraseExampleBox}>
                <Text style={styles.phraseExample}>
                  "{dailyPhrase.usage}"
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.navigate("AITutor")}
            >
              <Text style={styles.primaryButtonText}>Practice It</Text>
              <Ionicons
                name="mic"
                size={18}
                color="white"
                style={{ marginLeft: 8 }}
              />
            </TouchableOpacity>
          </LinearGradient>
        );
      case 1:
        const hasLiveSession = true;
        gradientColors = ["#F0FDF4", "#DCFCE7"] as const;
        return (
          <LinearGradient colors={gradientColors} style={styles.slide}>
            <View style={styles.tagRow}>
              <View
                style={[
                  styles.tag,
                  { backgroundColor: hasLiveSession ? "#DCFCE7" : "#DBEAFE" },
                ]}
              >
                {hasLiveSession && (
                  <Animated.View style={[styles.pulseDot, animatedPulse]} />
                )}
                <Text
                  style={[
                    styles.tagText,
                    { color: hasLiveSession ? "#16A34A" : "#2563EB" },
                  ]}
                >
                  {hasLiveSession ? "LIVE NOW" : "UP NEXT"}
                </Text>
              </View>
              <View
                style={[
                  styles.accentIcon,
                  { backgroundColor: hasLiveSession ? "#DCFCE7" : "#DBEAFE" },
                ]}
              >
                <Ionicons
                  name={hasLiveSession ? "people" : "time-outline"}
                  size={20}
                  color={hasLiveSession ? "#16A34A" : "#2563EB"}
                />
              </View>
            </View>
            <View style={styles.contentColumn}>
              <Text style={styles.headline} numberOfLines={2}>
                {hasLiveSession
                  ? "Business English Masterclass"
                  : "IELTS Speaking Drills"}
              </Text>
              <Text style={styles.subheadline}>
                {hasLiveSession
                  ? "Coach Sarah • 12 joined"
                  : "Starting in 24m 45s"}
              </Text>
              <View style={styles.chipRow}>
                {["Emails", "Meetings", "Negotiations"].map((chip) => (
                  <View key={chip} style={styles.miniChip}>
                    <Text style={styles.miniChipText}>{chip}</Text>
                  </View>
                ))}
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: theme.colors.success },
              ]}
              onPress={() => navigation.navigate("CallPreference")}
            >
              <Text style={styles.primaryButtonText}>Join Session</Text>
              <Ionicons
                name="flash"
                size={18}
                color="white"
                style={{ marginLeft: 8 }}
              />
            </TouchableOpacity>
          </LinearGradient>
        );
      case 2:
        gradientColors = ["#F5F3FF", "#EDE9FE"] as const;
        return (
          <LinearGradient colors={gradientColors} style={styles.slide}>
            <View style={styles.tagRow}>
              <View style={[styles.tag, { backgroundColor: "#F3E8FF" }]}>
                <Text style={[styles.tagText, { color: "#9333EA" }]}>
                  AI TUTOR
                </Text>
              </View>
              <View style={[styles.accentIcon, { backgroundColor: "#F3E8FF" }]}>
                <Ionicons name="sparkles" size={20} color="#9333EA" />
              </View>
            </View>
            <View style={styles.contentColumn}>
              <Text style={styles.headline} numberOfLines={2}>
                Practice anytime with Maya
              </Text>
              <Text style={styles.subheadline} numberOfLines={2}>
                Get instant feedback on your speaking and grammar
              </Text>
              <View style={styles.chipRow}>
                {PROMPT_CHIPS.map((chip) => (
                  <TouchableOpacity
                    key={chip}
                    style={styles.promptChip}
                    onPress={() => navigation.navigate("AITutor")}
                  >
                    <Text style={styles.promptChipText}>{chip}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: "#9333EA" }]}
              onPress={() => navigation.navigate("AITutor")}
            >
              <Text style={styles.primaryButtonText}>Chat with Maya</Text>
              <Ionicons
                name="sparkles"
                size={18}
                color="white"
                style={{ marginLeft: 8 }}
              />
            </TouchableOpacity>
          </LinearGradient>
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <BlurView
        intensity={theme.variation === "deep" ? 30 : 60}
        tint={theme.variation === "deep" ? "dark" : "light"}
        style={styles.blurContainer}
      >
        <FlatList
          ref={flatListRef}
          data={[0, 1, 2]}
          renderItem={renderSlide}
          keyExtractor={(item) => item.toString()}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          onScrollBeginDrag={onScrollBeginDrag}
          snapToInterval={CARD_WIDTH}
          decelerationRate="fast"
        />
        <View style={styles.dotRow}>
          {[0, 1, 2].map((i) => (
            <TouchableOpacity
              key={i}
              onPress={() =>
                flatListRef.current?.scrollToIndex({ index: i, animated: true })
              }
              style={[
                styles.dot,
                activeIndex === i ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
      </BlurView>
    </View>
  );
};

export default HomeMainCarousel;

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      marginHorizontal: 20,
      marginBottom: 24,
      borderRadius: 28,
      overflow: "hidden",
      height: CAROUSEL_HEIGHT,
      ...theme.shadows.large,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
    },
    blurContainer: {
      flex: 1,
    },
    slide: {
      width: CARD_WIDTH,
      padding: 16,
      justifyContent: "space-between",
    },
    tagRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    tag: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    tagText: {
      fontSize: 10,
      fontWeight: "800",
    },
    accentIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
    },
    pulseDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#16A34A",
    },
    contentColumn: {
      flex: 1,
      justifyContent: "center",
    },
    headline: {
      fontSize: 20,
      fontWeight: "800",
      color: theme.colors.text.primary,
      letterSpacing: -0.5,
      marginBottom: 2,
    },
    subheadline: {
      fontSize: 13,
      color: theme.colors.text.secondary,
      opacity: 0.8,
      marginBottom: 8,
    },
    phraseExampleBox: {
      backgroundColor: "rgba(0,0,0,0.03)",
      padding: 8,
      borderRadius: 8,
      borderLeftWidth: 3,
      borderLeftColor: "#FFE082",
      marginBottom: 12,
    },
    phraseExample: {
      fontSize: 13,
      fontStyle: "italic",
      color: theme.colors.text.secondary,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 4,
    },
    miniChip: {
      backgroundColor: "rgba(0,0,0,0.05)",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    miniChipText: {
      fontSize: 11,
      color: theme.colors.text.secondary,
      fontWeight: "600",
    },
    promptChip: {
      backgroundColor: "rgba(99, 102, 241, 0.1)",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "rgba(99, 102, 241, 0.2)",
    },
    promptChipText: {
      fontSize: 11,
      color: theme.colors.primary,
      fontWeight: "600",
    },
    primaryButton: {
      backgroundColor: theme.colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      borderRadius: 12,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    primaryButtonText: {
      color: "white",
      fontWeight: "700",
      fontSize: 14,
    },
    dotRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      position: "absolute",
      bottom: 10,
      width: "100%",
      gap: 8,
    },
    dot: {
      height: 4,
      borderRadius: 2,
    },
    dotActive: {
      width: 16,
      backgroundColor: theme.colors.primary,
    },
    dotInactive: {
      width: 4,
      backgroundColor: "rgba(0,0,0,0.1)",
    },
  });
