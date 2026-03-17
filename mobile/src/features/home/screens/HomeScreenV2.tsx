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
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
  useAnimatedProps,
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

const { width } = Dimensions.get('window');

const AnimatedText = Animated.createAnimatedComponent(Text);

// --- Subcomponents ---

const GlassCard = ({ children, style }: { children: React.ReactNode; style?: any }) => (
  <BlurView intensity={80} tint="dark" style={[styles.glassCard, style]}>
    {children}
  </BlurView>
);

// --- Score Ring ---

const SIZE = 240;
const STROKE_WIDTH = 16;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CENTER = SIZE / 2;
const START_ANGLE = -220;
const END_ANGLE = 40;
const TOTAL_ANGLE = 260;
const MAX_SCORE = 1000;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
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
    animatedProgress.value = withSpring(safeScore / MAX_SCORE, {
      damping: 20,
      stiffness: 60,
    });
  }, [safeScore, animatedProgress]);

  const animatedArcProps = useAnimatedProps(() => {
    const offset = arcLength * (1 - animatedProgress.value);
    return { strokeDashoffset: offset } as any;
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
          animatedProps={animatedArcProps}
          stroke="url(#scoreGradient)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={arcLength}
          strokeDashoffset={arcLength}
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
}: {
  label: string;
  icon: React.ReactNode;
  colors: readonly any[];
  shadowColor: string;
}) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPressIn={() => (scale.value = withSpring(0.95))}
      onPressOut={() => (scale.value = withSpring(1))}
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
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={tokensV2.colors.primaryViolet} />
        <Text style={styles.loadingText}>Loading your home…</Text>
      </View>
    );
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <BlurView intensity={60} tint="dark" style={styles.headerPill}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarBorder}>
              <View style={styles.avatar}>
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
            <Text style={styles.username}>{displayName}</Text>
          </View>
          <View style={styles.streakPill}>
            <Text style={styles.streakText}>🔥 {streakCount || 0} day streak</Text>
          </View>
        </BlurView>

        {/* TODAY'S GOAL */}
        <GlassCard style={styles.goalCard}>
          <View>
            <Text style={styles.goalTitle}>Today's Goal</Text>
            <Text style={styles.goalSubtitle}>Goal: {header.goalLabel}</Text>
          </View>
          <View
            style={[
              styles.glowingDot,
              { opacity: 1 },
            ]}
          />
        </GlassCard>

        {/* SCORE RING */}
        <ScoreRing
          score={score}
          level={level}
          nextLevelLabel={nextLevelLabel}
          progressToNext={progressToNext}
        />

        {/* AI INSIGHT */}
        <Animated.View entering={FadeInDown.delay(200)}>
          <GlassCard style={styles.insightCard}>
            <View style={styles.insightHeader}>
              <View style={styles.aiCircle}>
                <Text style={styles.aiLabel}>AI</Text>
              </View>
              <Text style={styles.insightTitle}>AI Insight</Text>
            </View>
            {skills?.details?.maya_insight ? (
              <Text style={styles.insightBody}>{skills.details.maya_insight.subtext}</Text>
            ) : (
              <Text style={styles.insightBody}>
                Maya is learning from your recent sessions. Check back after your next call.
              </Text>
            )}
          </GlassCard>
        </Animated.View>

        {/* SUMMARY CAROUSEL */}
        <ScrollView
          horizontal
          snapToInterval={width * 0.7 + 20}
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
            </GlassCard>
          </Animated.View>

          {/* Card 2: This Week */}
          <Animated.View entering={FadeInDown.delay(360)}>
            <GlassCard style={styles.summaryCard}>
              <Text style={styles.cardTitle}>This Week</Text>
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
                <View style={styles.callAvatar} />
                <View style={styles.callInfo}>
                  <Text style={styles.callText}>No recent calls yet</Text>
                  <View style={styles.onlineDot} />
                </View>
              </View>
            </GlassCard>
          </Animated.View>

          {/* Card 4: Streak */}
          <Animated.View entering={FadeInDown.delay(520)}>
            <GlassCard style={styles.summaryCard}>
               <Text style={styles.cardTitle}>Streak</Text>
               <View style={styles.streakCenter}>
                  <Text style={styles.hugeEmoji}>🔥</Text>
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
                  <Text style={styles.topicTitle}>{card.data?.title}</Text>
                  {card.data?.difficulty && (
                    <View style={styles.topicPill}>
                      <Text style={styles.topicPillText}>{card.data.difficulty}</Text>
                    </View>
                  )}
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
    borderColor: 'rgba(255,255,255,0.1)',
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
  },
  avatar: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  username: {
    color: tokensV2.colors.textPrimary,
    fontWeight: '700',
    fontSize: 18,
  },
  streakPill: {
    backgroundColor: tokensV2.colors.accentAmber,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: tokensV2.borderRadius.l,
  },
  streakText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 12,
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
  },
  scoreOverlay: {
    position: 'absolute',
    top: 90,
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
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  aiCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: tokensV2.colors.primaryViolet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  insightTitle: {
    color: tokensV2.colors.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  insightBody: {
    color: tokensV2.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  carouselContent: {
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: tokensV2.spacing.xl,
  },
  summaryCard: {
    width: 150,
    padding: tokensV2.spacing.m,
    height: 140,
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: tokensV2.colors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: tokensV2.colors.textSecondary,
  },
});
