import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  Image,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { withDelay } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  interpolate,
} from 'react-native-reanimated';

import Svg, {
  Path,
  Circle,
  Line,
  G,
  LinearGradient as SvgGradient,
  Stop,
  Defs,
  Polygon,
  Text as SvgText,
} from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getHomeData, HomeData } from '../services/homeApi';
import { tokensV2 } from '../../../theme/tokensV2';

// Safe Haptics fallback
let Haptics: any = {
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
};
try {
  Haptics = require('expo-haptics');
} catch (e) {}

const { width } = Dimensions.get('window');

const AnimatedText = Animated.createAnimatedComponent(Text);

// --- Subcomponents ---

const GlassCard = ({ children, style }: { children: React.ReactNode; style?: any }) => (
  <BlurView intensity={80} tint="dark" style={[styles.glassCard, style]}>
    {children}
  </BlurView>
);

const PulseDot = ({ color = tokensV2.colors.accentMint, size = 10 }: { color?: string; size?: number }) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.8);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      true
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 1000 }),
        withTiming(0.8, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: size,
            elevation: 8,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
};

const SkillBar = ({ label, score }: { label: string; score: number }) => (
  <View style={styles.skillBarRow}>
    <View style={styles.skillBarInfo}>
      <Text style={styles.skillBarLabel}>{label}</Text>
      <Text style={styles.skillBarPercent}>{score}%</Text>
    </View>
    <View style={styles.skillBarBg}>
      <LinearGradient
        colors={[tokensV2.colors.primaryViolet, tokensV2.colors.accentAmber] as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.skillBarFill, { width: `${score}%` }]}
      />
    </View>
  </View>
);

const MicroStatChip = ({ label, value, icon }: { label: string; value: string; icon: string }) => (
  <BlurView intensity={40} tint="dark" style={styles.statChip}>
    <Text style={styles.statIcon}>{icon}</Text>
    <View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  </BlurView>
);

const SkeletonCard = ({ width: cardWidth = 150, height: cardHeight = 180 }) => {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1500 }), -1);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.7, 0.3]),
  }));

  return (
    <Animated.View style={[styles.glassCard, { width: cardWidth, height: cardHeight, padding: 16, opacity: 0.6 }, animatedStyle]}>
      <View style={{ width: 60, height: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 6, marginBottom: 12 }} />
      <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12 }} />
    </Animated.View>
  );
};

const SkeletonScreen = () => (
  <View style={styles.loadingRoot}>
    <View style={styles.skeletonHeader}>
       <View style={{ width: 200, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' }} />
    </View>
    <ScrollView contentContainerStyle={styles.scrollContent} scrollEnabled={false}>
       <View style={{ height: 60, width: '100%', borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 24 }} />
       <View style={{ height: 200, width: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.05)', alignSelf: 'center', marginBottom: 40 }} />
       <View style={{ flexDirection: 'row', gap: 12, marginBottom: 32 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
       </View>
    </ScrollView>
  </View>
);

// --- Score Ring ---

const SIZE = 240;
const STROKE_WIDTH = 16;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CENTER = SIZE / 2;
const START_ANGLE = -120;
const END_ANGLE = 120;
const TOTAL_ANGLE = 240;
const MAX_SCORE = 1000;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

const ScoreRing = ({
  score = 0,
  level,
  nextLevelLabel,
  progressToNext,
}: {
  score?: number;
  level?: string;
  nextLevelLabel?: string;
  progressToNext?: number;
}) => {
  const safeScore = Math.max(0, Math.min(MAX_SCORE, score ?? 0));
  const animatedProgress = useSharedValue(0);
  const arcLength = (Math.PI * TOTAL_ANGLE * RADIUS) / 180;

  useEffect(() => {
    // Small delay to ensure layout is ready and animation is visible
    animatedProgress.value = 0;
    animatedProgress.value = withDelay(500, withTiming(safeScore / MAX_SCORE, {
      duration: 1500,
    }));
  }, [safeScore, animatedProgress]);

  const animatedArcProps = useAnimatedProps(() => {
    // Offset goes from arcLength (empty) to 0 (full)
    const offset = arcLength * (1 - animatedProgress.value);
    return { 
      strokeDashoffset: offset,
    } as any;
  });

  return (
    <View style={styles.scoreRingContainer}>
      <Svg width={SIZE} height={SIZE}>
        <Defs>
          <SvgGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#6C63FF" />
            <Stop offset="100%" stopColor="#FFB347" />
          </SvgGradient>
        </Defs>
        <Path
          d={arcPath(CENTER, CENTER, RADIUS, START_ANGLE, END_ANGLE)}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          fill="none"
        />
        <AnimatedPath
          d={arcPath(CENTER, CENTER, RADIUS, START_ANGLE, END_ANGLE)}
          animatedProps={animatedArcProps}
          stroke="url(#scoreGradient)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={arcLength}
        />
      </Svg>

      <View style={styles.scoreOverlay}>
        <View style={styles.badgePill}>
          <Text style={styles.badgeTextPill}>{level || '--'}</Text>
        </View>
        <Text style={styles.scoreNumber}>
          {safeScore <= 0 ? '--' : Math.round(safeScore)}
        </Text>
        <Text style={styles.scoreLabel}>Overall Score</Text>
      </View>

      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarBackground}>
          <LinearGradient
            colors={tokensV2.gradients.progressBar}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.progressBar,
              { width: `${Math.max(0, Math.min(100, progressToNext ?? 0))}%` },
            ]}
          />
        </View>
        <Text style={styles.progressLabel}>
          {nextLevelLabel || 'Progress to next level'}
        </Text>
      </View>
    </View>
  );
};

// --- Radar Chart ---

const RADAR_SIZE = 140;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = 50;
const NUM_AXES = 6;
const RADAR_LABELS = [
  'Speaking',
  'Listening',
  'Grammar',
  'Vocabulary',
  'Fluency',
  'Pronunciation',
];

function axisAngle(i: number) {
  return (i * 360) / NUM_AXES - 90;
}

function axisPoint(i: number, ratio: number) {
  const angle = (axisAngle(i) * Math.PI) / 180;
  return {
    x: RADAR_CENTER + RADAR_RADIUS * ratio * Math.cos(angle),
    y: RADAR_CENTER + RADAR_RADIUS * ratio * Math.sin(angle),
  };
}

const RadarChart = ({ scores }: { scores?: { [key: string]: number } }) => {
  const wrapperSize = RADAR_SIZE + 60;
  const offset = 30;
  const ringRatios = [0.25, 0.5, 0.75, 1];

  const getScoreForLabel = (label: string) => {
    const value =
      scores?.[label] ??
      scores?.[label.toLowerCase()] ??
      scores?.[label.toLowerCase().replace(' ', '')];
    return value ?? 30;
  };

  const dataPoints = RADAR_LABELS.map((label, i) => {
    const ratio = getScoreForLabel(label) / 100;
    return axisPoint(i, ratio);
  });

  return (
    <Svg width={wrapperSize} height={wrapperSize}>
      <G x={offset} y={offset}>
        {ringRatios.map((ratio, idx) => {
          const ringPoints = RADAR_LABELS.map((_, i) => axisPoint(i, ratio));
          const d = ringPoints.map((p) => `${p.x},${p.y}`).join(' ');
          return (
            <Polygon
              key={`ring-${idx}`}
              points={d}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
              fill="none"
            />
          );
        })}

        {RADAR_LABELS.map((_, i) => {
          const edge = axisPoint(i, 1);
          return (
            <Line
              key={`axis-${i}`}
              x1={RADAR_CENTER}
              y1={RADAR_CENTER}
              x2={edge.x}
              y2={edge.y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
          );
        })}

        <Polygon
          points={dataPoints.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="rgba(108,99,255,0.45)"
          stroke="#00D2FF"
          strokeWidth={1.5}
        />

        {dataPoints.map((p, idx) => (
          <Circle
            key={`dot-${idx}`}
            cx={p.x}
            cy={p.y}
            r={3}
            fill="#6C63FF"
            stroke="#FFFFFF"
            strokeWidth={1}
          />
        ))}

        {RADAR_LABELS.map((label, i) => {
          const labelRatio = (RADAR_RADIUS + 18) / RADAR_RADIUS;
          const p = axisPoint(i, labelRatio);
          return (
            <SvgText
              key={`label-${label}`}
              x={p.x}
              y={p.y}
              fontSize={8}
              fill="rgba(255,255,255,0.5)"
              textAnchor="middle"
            >
              {label}
            </SvgText>
          );
        })}
      </G>
    </Svg>
  );
};

const QuickActionButton = ({
  label,
  icon,
  colors,
  shadowColor,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  colors: readonly any[];
  shadowColor: string;
  onPress?: () => void;
}) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress?.();
  };

  return (
    <Pressable
      onPressIn={() => (scale.value = withSpring(0.95))}
      onPressOut={() => (scale.value = withSpring(1))}
      onPress={handlePress}
    >
      <Animated.View style={[styles.actionBtn, animatedStyle, { shadowColor }]}>
        <LinearGradient colors={colors as any} style={styles.actionGradient}>
          {icon}
          <Text style={styles.actionLabel}>{label}</Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
};

// --- Main Component ---

export default function HomeScreenV2() {
  const { user, isLoaded } = useUser();
  const navigation: any = useNavigation();
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);

  const header = homeData?.header;
  const skills = homeData?.skills;

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      const fetchData = async () => {
        try {
          const cachedHome = await AsyncStorage.getItem('@home_data_cache');
          if (cachedHome && !homeData) {
            setHomeData(JSON.parse(cachedHome));
            setLoading(false);
          }

          const fresh = await getHomeData();
          setHomeData(fresh);
          await AsyncStorage.setItem('@home_data_cache', JSON.stringify(fresh));
        } catch (e) {
          console.warn('[HomeScreenV2] Failed to fetch home data', e);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }, [user]),
  );

  if (!isLoaded || loading || !homeData || !header) {
    return <SkeletonScreen />;
  }

  const displayName = header.userName || user?.firstName || 'Friend';
  const streakCount = header.streak || 0;
  const score = header.score ?? 0;
  const level = header.level || '--';
  const nextLevelLabel = header.goalLabel || '';
  const progressToNext = header.goalTarget ? (score / header.goalTarget) * 100 : 0;

  return (
    <View style={styles.root}>
      {/* AURORA BACKGROUND */}
      <View style={styles.auroraContainer}>
        <LinearGradient
          colors={['rgba(108,99,255,0.2)', 'transparent'] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.auroraLeft}
        />
        <LinearGradient
          colors={['rgba(255,179,71,0.2)', 'transparent'] as const}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.auroraRight}
        />
      </View>

      {/* FROZEN HEADER */}
      <View style={styles.frozenHeader}>
        <BlurView intensity={60} tint="dark" style={styles.headerPill}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarBorder}>
              <View style={styles.avatarPill}>
                <Text style={styles.avatarInitials}>
                  {(displayName || 'A')
                    .split(' ')
                    .map((n) => n[0]?.toUpperCase())
                    .filter(Boolean)
                    .join('')
                    .slice(0, 2)}
                </Text>
              </View>
            </View>
            <View>
              <Text style={styles.greetingText}>Welcome back,</Text>
              <Text style={styles.usernameText}>{displayName}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity 
              style={styles.headerIconBtn}
              onPress={() => navigation.navigate('Conversations')}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerIconBtn}
              onPress={() => navigation.navigate('Notifications')}
            >
              <Ionicons name="notifications-outline" size={22} color="#fff" />
              <View style={styles.notificationDot} />
            </TouchableOpacity>
            <View style={styles.streakPillSmall}>
              <Text style={styles.streakTextSmall}>🔥 {streakCount}</Text>
            </View>
          </View>
        </BlurView>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={{ height: 80 }} /> {/* Spacer for frozen header */}

        {/* TODAY'S GOAL */}
        <GlassCard style={styles.goalCard}>
          <View>
            <Text style={styles.goalTitle}>Today's Goal</Text>
            <Text style={styles.goalSubtitle}>Goal: {header.goalLabel}</Text>
          </View>
          <View style={styles.goalProgress}>
            <Text style={styles.goalPercent}>{Math.round(progressToNext)}%</Text>
            <PulseDot color={tokensV2.colors.accentMint} size={10} />
          </View>
        </GlassCard>

        {/* SCORE RING */}
        <ScoreRing
          score={score}
          level={level}
          nextLevelLabel={nextLevelLabel}
          progressToNext={progressToNext}
        />

        {/* MICRO-STAT ROW */}
        <View style={styles.microStatRow}>
           <MicroStatChip icon="⚡️" label="Sessions" value="24" />
           <MicroStatChip icon="🎯" label="Avg Score" value="782" />
           <MicroStatChip icon="⏱️" label="Minutes" value="120" />
        </View>

        {/* AI INSIGHT */}
        <Animated.View entering={FadeInDown.delay(200)}>
          <LinearGradient
            colors={['rgba(108,99,255,0.15)', 'rgba(255,179,71,0.05)'] as any}
            style={styles.insightCardContainer}
          >
            <View style={styles.insightHeader}>
              <View style={styles.mayaAvatarContainer}>
                <Image 
                  source={{ uri: 'https://api.dicebear.com/7.x/avataaars/png?seed=Maya&backgroundColor=6c63ff' }} 
                  style={styles.mayaAvatar}
                />
                <View style={styles.mayaOnlineDot} />
              </View>
              <View>
                <Text style={styles.insightTitle}>Maya's Insight</Text>
                <Text style={styles.mayaStatus}>Active now</Text>
              </View>
            </View>
            <View style={styles.insightBubble}>
              {skills?.details?.maya_insight ? (
                <Text style={styles.insightBody}>{skills.details.maya_insight.subtext}</Text>
              ) : (
                <Text style={styles.insightBody}>
                  I'm still analyzing your recent patterns. Let's have another conversation soon!
                </Text>
              )}
            </View>
            <TouchableOpacity 
              style={styles.insightLink}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})}
            >
              <Text style={styles.insightLinkText}>View detailed report →</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        {/* SUMMARY CAROUSEL */}
        <ScrollView
          horizontal
          snapToInterval={150 + 12}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContent}
        >
          {/* Card 1: Skills */}
          <Animated.View entering={FadeInDown.delay(280)}>
            <GlassCard style={styles.summaryCard}>
              <Text style={styles.cardTitle}>Skills</Text>
              <View style={styles.chartContainer}>
                <RadarChart
                  scores={{
                    Speaking: skills?.scores.speaking ?? 30,
                    Listening: skills?.scores.listening ?? 30,
                    Grammar: skills?.scores.grammar ?? 30,
                    Vocabulary: skills?.scores.vocabulary ?? 30,
                    Fluency: skills?.scores.fluency ?? 30,
                    Pronunciation: skills?.scores.pronunciation ?? 30,
                  }}
                />
              </View>
              <View style={styles.skillBarsList}>
                 <SkillBar label="Speaking" score={skills?.scores.speaking ?? 30} />
                 <SkillBar label="Listening" score={skills?.scores.listening ?? 30} />
                 <SkillBar label="Grammar" score={skills?.scores.grammar ?? 30} />
                 <SkillBar label="Vocabulary" score={skills?.scores.vocabulary ?? 30} />
                 <SkillBar label="Fluency" score={skills?.scores.fluency ?? 30} />
                 <SkillBar label="Pronunciation" score={skills?.scores.pronunciation ?? 30} />
              </View>
            </GlassCard>
          </Animated.View>

          {/* Card 2: This Week */}
          <Animated.View entering={FadeInDown.delay(360)}>
            <GlassCard style={styles.summaryCard}>
              <Text style={styles.cardTitle}>This Week</Text>
              <View style={styles.heatmapHeader}>
                 {['M','T','W','T','F','S','S'].map((d, i) => (
                    <Text key={i} style={styles.heatmapDay}>{d}</Text>
                 ))}
              </View>
              <View style={styles.heatmap}>
                {Array.from({ length: 35 }).map((_, index) => {
                  const value = homeData.weeklyActivity?.[index] ?? 0;
                  let backgroundColor = 'rgba(255,255,255,0.08)';
                  if (value > 0 && value <= 0.33) {
                    backgroundColor = 'rgba(0,229,160,0.3)';
                  } else if (value > 0.33 && value <= 0.66) {
                    backgroundColor = 'rgba(0,229,160,0.6)';
                  } else if (value > 0.66) {
                    backgroundColor = '#00E5A0';
                  }
                  return <View key={index} style={[styles.heatSquare, { backgroundColor }]} />;
                })}
              </View>
            </GlassCard>
          </Animated.View>
          
          {/* Card 3: Recent Call */}
          <Animated.View entering={FadeInDown.delay(440)}>
            <GlassCard style={styles.summaryCard}>
              <Text style={styles.cardTitle}>Recent Call</Text>
              <View style={styles.recentCall}>
                {header.lastSessionDate ? (
                  <>
                    <View style={styles.avatarBorder}>
                      <View style={styles.avatarPill}>
                        <Text style={styles.avatarInitials}>JS</Text>
                      </View>
                    </View>
                    <View style={styles.callInfo}>
                      <Text style={styles.callText}>15 mins</Text>
                      <View style={styles.scoreChip}>
                         <Text style={styles.scoreChipText}>7.5</Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.emptyCall}>
                    <Text style={styles.emptyIcon}>📞</Text>
                    <TouchableOpacity 
                      style={styles.emptyCta}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        navigation.navigate('CallPreference');
                      }}
                    >
                      <Text style={styles.emptyCtaText}>Start your first call</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </GlassCard>
          </Animated.View>

          {/* Card 4: Streak */}
          <Animated.View entering={FadeInDown.delay(520)}>
            <GlassCard style={styles.summaryCard}>
               <Text style={styles.cardTitle}>Streak</Text>
               <View style={styles.streakCenter}>
                  <PulseDot color="#FF4500" size={32} />
                  <Text style={styles.streakCount}>{streakCount || 0} Days</Text>
                  <View style={styles.dayRow}>
                     {[...Array(7)].map((_, i) => (
                        <View key={i} style={[styles.dayDot, { backgroundColor: i < 5 ? tokensV2.colors.accentAmber : 'rgba(255,255,255,0.2)' }]} />
                     ))}
                  </View>
               </View>
            </GlassCard>
          </Animated.View>
        </ScrollView>

        {/* QUICK ACTION ROW */}
        <View style={styles.actionRow}>
          <QuickActionButton
            label="Start Call"
            icon={
              <Svg width={28} height={28} viewBox="0 0 24 24">
                <Path
                  d="M6.5 3A1.5 1.5 0 0 0 5 4.5v3A1.5 1.5 0 0 0 6.5 9H8v3.5A4.5 4.5 0 0 0 12.5 17H13v1.5a1.5 1.5 0 0 0 3 0v-9A4.5 4.5 0 0 0 11.5 5H8V4.5A1.5 1.5 0 0 0 6.5 3Z"
                  fill="#FFFFFF"
                />
              </Svg>
            }
            colors={tokensV2.gradients.callButton}
            shadowColor={tokensV2.shadows.violet.shadowColor}
            onPress={() => navigation.navigate('CallPreference')}
          />
          <QuickActionButton
            label="Practice"
            icon={
              <Svg width={28} height={28} viewBox="0 0 24 24">
                <Path
                  d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-5 8a1 1 0 0 0-1 1 6 6 0 0 0 5 5.91V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.09A6 6 0 0 0 18 12a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 0 0-1-1Z"
                  fill="#FFFFFF"
                />
              </Svg>
            }
            colors={tokensV2.gradients.practiceButton}
            shadowColor={tokensV2.shadows.amber.shadowColor}
            onPress={() => navigation.navigate('PracticeHome')}
          />
          <QuickActionButton
            label="EBites"
            icon={
              <Svg width={28} height={28} viewBox="0 0 24 24">
                <Path d="M8 5v14l11-7z" fill="#FFFFFF" />
              </Svg>
            }
            colors={tokensV2.gradients.ebitesButton}
            shadowColor={tokensV2.shadows.mint.shadowColor}
            onPress={() => navigation.navigate('EBites')}
          />
        </View>

        {/* TOPIC CAROUSEL */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.topicCarousel}
        >
          {homeData.contextualCards
            .filter((card: any) => card.type === 'home_main_carousel')
            .map((card: any, idx: number) => (
              <TouchableOpacity
                key={`${card.data?.title || 'topic'}-${idx}`}
                style={styles.topicCard}
                onPress={() => navigation.navigate(card.data?.targetScreen || 'CallPreference')}
              >
                <LinearGradient
                  colors={card.data?.gradient || ['#6C63FF', '#3F3D56']}
                  style={styles.topicGradient}
                >
                  <View style={styles.topicHeader}>
                    <Text style={styles.topicTitle}>{card.data?.title}</Text>
                    <Text style={styles.topicIcon}>{card.data?.icon || '📚'}</Text>
                  </View>
                  <View>
                    {card.data?.difficulty && (
                      <View style={styles.topicPill}>
                        <Text style={styles.topicPillText}>{card.data.difficulty}</Text>
                      </View>
                    )}
                    <Text style={styles.topicDuration}>15 min</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
        </ScrollView>
        
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokensV2.colors.background,
  },
  auroraContainer: {
    ...StyleSheet.absoluteFillObject,
    height: 400,
  },
  auroraLeft: {
    position: 'absolute',
    left: -100,
    top: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  auroraRight: {
    position: 'absolute',
    right: -100,
    top: -50,
    width: 350,
    height: 350,
    borderRadius: 175,
  },
  scrollContent: {
    paddingHorizontal: tokensV2.spacing.m,
    paddingTop: 48,
    paddingBottom: 120,
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: tokensV2.spacing.s,
    borderRadius: tokensV2.borderRadius.pill,
    width: '100%',
    marginBottom: tokensV2.spacing.l,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarBorder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: tokensV2.colors.primaryViolet,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPill: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingText: {
    color: tokensV2.colors.textMuted,
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 0,
  },
  usernameText: {
    color: tokensV2.colors.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF4B4B',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
  },
  streakPillSmall: {
    backgroundColor: 'rgba(255,179,71,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,179,71,0.2)',
  },
  streakTextSmall: {
    color: tokensV2.colors.accentAmber,
    fontWeight: '800',
    fontSize: 12,
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  glassCard: {
    borderRadius: tokensV2.borderRadius.l,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: tokensV2.spacing.m,
    marginBottom: 16,
  },
  goalTitle: {
    color: tokensV2.colors.textPrimary,
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 4,
  },
  goalSubtitle: {
    color: tokensV2.colors.textSecondary,
    fontSize: 14,
  },
  glowingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: tokensV2.colors.accentMint,
    shadowColor: tokensV2.colors.accentMint,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
  },
  scoreRingContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    width: SIZE,
    height: SIZE + 48,
    alignSelf: 'center',
  },
  scoreOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgePill: {
    backgroundColor: tokensV2.colors.primaryViolet,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  badgeTextPill: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  scoreNumber: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '800',
  },
  scoreLabel: {
    color: tokensV2.colors.textMuted,
    fontSize: 14,
  },
  progressBarContainer: {
    width: SIZE,
    alignSelf: 'center',
    marginTop: 12,
  },
  progressBarBackground: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressBar: {
    height: 6,
  },
  progressLabel: {
    color: tokensV2.colors.textSecondary,
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  insightCard: {
    padding: tokensV2.spacing.m,
    marginBottom: tokensV2.spacing.l,
    borderLeftWidth: 3,
    borderLeftColor: '#6C63FF',
  },
  insightCardContainer: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
    overflow: 'hidden',
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  mayaAvatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(108,99,255,0.2)',
    padding: 2,
    position: 'relative',
  },
  mayaAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  mayaOnlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00E5A0',
    borderWidth: 2,
    borderColor: '#1A1B2E',
  },
  insightTitle: {
    color: tokensV2.colors.textPrimary,
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: -0.5,
  },
  mayaStatus: {
    color: '#00E5A0',
    fontSize: 10,
    fontWeight: '600',
    marginTop: -2,
  },
  insightBubble: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 20,
    borderTopLeftRadius: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  insightBody: {
    color: '#E0E0EF',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  insightLink: {
    alignSelf: 'flex-end',
  },
  insightLinkText: {
    color: tokensV2.colors.primaryViolet,
    fontSize: 13,
    fontWeight: '700',
  },
  carouselContent: {
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: tokensV2.spacing.xl,
  },
  summaryCard: {
    width: 150,
    padding: tokensV2.spacing.m,
    height: 180,
  },
  cardTitle: {
    color: tokensV2.colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 12,
  },
  chartContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heatmap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  heatSquare: {
    width: 8,
    height: 8,
    borderRadius: 2,
    margin: 1.5,
  },
  recentCall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  callAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  callInfo: {
     flex: 1,
  },
  callText: {
    color: tokensV2.colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokensV2.colors.accentMint,
    marginTop: 8,
  },
  streakCenter: {
     flex: 1,
     alignItems: 'center',
     justifyContent: 'center',
  },
  hugeEmoji: {
     fontSize: 32,
     marginBottom: 4,
  },
  streakCount: {
     color: tokensV2.colors.accentAmber,
     fontSize: 24,
     fontWeight: '800',
     marginBottom: 8,
  },
  dayRow: {
     flexDirection: 'row',
     gap: 4,
  },
  dayDot: {
     width: 8,
     height: 8,
     borderRadius: 4,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: tokensV2.spacing.xl,
  },
  actionBtn: {
    width: (width - tokensV2.spacing.m * 2 - 24) / 3,
    height: 80,
    borderRadius: tokensV2.borderRadius.l,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  actionGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  topicCarousel: {
    gap: 16,
  },
  topicCard: {
    width: 150,
    height: 110,
    borderRadius: tokensV2.borderRadius.l,
    overflow: 'hidden',
  },
  topicGradient: {
    flex: 1,
    padding: tokensV2.spacing.m,
    justifyContent: 'space-between',
  },
  topicTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  topicPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: tokensV2.borderRadius.s,
  },
  topicPillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: tokensV2.colors.background,
  },
  skeletonHeader: {
    paddingTop: 60,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  frozenHeader: {
    position: 'absolute',
    top: 48,
    left: 20,
    right: 20,
    zIndex: 100,
  },
  goalProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goalPercent: {
    color: tokensV2.colors.accentMint,
    fontWeight: '700',
    fontSize: 14,
  },
  microStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 24,
  },
  statChip: {
    width: (width - 48) / 3,
    padding: 10,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  statIcon: {
    fontSize: 16,
  },
  statValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  statLabel: {
    color: tokensV2.colors.textMuted,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  skillBarsList: {
    marginTop: 8,
    gap: 4,
  },
  skillBarRow: {
    gap: 2,
  },
  skillBarInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skillBarLabel: {
    color: tokensV2.colors.textSecondary,
    fontSize: 8,
  },
  skillBarPercent: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '600',
  },
  skillBarBg: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  skillBarFill: {
    height: '100%',
  },
  heatmapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  heatmapDay: {
    color: tokensV2.colors.textMuted,
    fontSize: 8,
    width: 11,
    textAlign: 'center',
  },
  emptyCall: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyIcon: {
    fontSize: 24,
    opacity: 0.5,
  },
  emptyCta: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  emptyCtaText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  scoreChip: {
    backgroundColor: tokensV2.colors.accentMint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  scoreChipText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
  },
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  topicIcon: {
    fontSize: 16,
  },
  topicDuration: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    marginTop: 4,
  },
});
