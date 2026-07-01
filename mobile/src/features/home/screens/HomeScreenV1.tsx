import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Dimensions,
  Image,
  Animated as RNAnimated,
  Modal,
  RefreshControl,
  AccessibilityInfo,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useUser } from '@clerk/clerk-expo';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  FadeInDown,
  FadeIn,
  Easing,
} from 'react-native-reanimated';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../../theme/ThemeProvider';
import { ModeSwitcher } from '../../../components/navigation/ModeSwitcher';
import PulseHomeCarousel, {
  type PulseHomeCarouselHandle,
} from '../../../components/home/PulseHomeCarousel';
import { homeTheme } from '../theme/homeTheme';
import ConnectHeroCard from '../components/ConnectHeroCard';
import MistakesCard from '../components/MistakesCard';
import { getHomeData, HomeData } from '../services/homeApi';
import { getBridgeUser } from '../../../api/bridgeClient';
import {
  getDailyContentForToday,
  mergeDailyPhraseFields,
  mergeDailyWordFields,
  mergeHomeWithDailyContent,
  onDailyContentUpdated,
  setDailyContentForToday,
} from '../../../services/dailyContentCache';
import { HOME_DATA_CACHE_KEY, utcTodayKey } from '../../../services/cacheKeys';
import HomeCacheService from '../../../services/homeCacheService';
import { getNestAuthToken } from '../../../api/client';
import { tasksApi, type LearningTask } from '../../../api/tasks';
import { DailyListenVoiceModal } from '../../../components/settings/DailyListenVoiceModal';
import type { DailyListenVoice } from '../../../types/dailyListenVoice';

let Haptics: {
  impactAsync: (s: unknown) => Promise<void>;
  ImpactFeedbackStyle: { Light: string; Medium: string };
} = {
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
};
try {
  Haptics = require('expo-haptics');
} catch {
  /* optional */
}

type SkillDetailKeyV1 = 'grammar' | 'pronunciation' | 'fluency' | 'vocabulary';
type SkillSheetStateV1 =
  | null
  | { type: 'overall' }
  | { type: 'skill'; label: string; detailKey: SkillDetailKeyV1 };

function HomeSkillDetailModalV1({
  visible,
  onClose,
  sheet,
  skills,
  headerScore,
  goalLabel,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  sheet: SkillSheetStateV1;
  skills: HomeData['skills'] | undefined;
  headerScore: number;
  goalLabel: string;
  theme: any;
}) {
  if (!sheet || !skills) return null;

  const c = theme.colors;
  const deltas = skills.deltas || {};
  const details = skills.details || {};
  const scores = skills.scores || {};
  const mastery = skills.masteryFlags;

  const formatDelta = (k: string) => {
    const d = deltas[k];
    if (d == null || d === 0) return null;
    const sign = d > 0 ? '+' : '';
    return `${sign}${d}`;
  };

  const cardBg = c.surface ?? '#1a1520';
  const border = c.border ?? 'rgba(255,255,255,0.1)';
  const textPri = c.text?.primary ?? '#fff';
  const textSec = c.text?.secondary ?? 'rgba(255,255,255,0.7)';
  const textMut = c.text?.light ?? 'rgba(255,255,255,0.5)';
  const accent = c.primary ?? '#8B5CF6';
  const mint = c.success ?? '#86efac';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[st.modalCard, { backgroundColor: cardBg, borderColor: border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {sheet.type === 'overall' ? (
              <>
                <Text style={[st.modalTitle, { color: textPri }]}>Overall score</Text>
                <Text style={[st.modalBody, { color: textSec }]}>
                  {headerScore > 100
                    ? 'This ring is your EngR progress (0–1000) toward your next milestone. It combines your skills from your latest analyzed session — not a single test.'
                    : 'This score reflects your overall EngR progress toward your next milestone, based on your latest analyzed session.'}
                </Text>
                <Text style={[st.modalMeta, { color: textMut }]}>
                  Current: {headerScore <= 0 ? '—' : Math.round(headerScore)}
                  {headerScore > 100 ? ' pts' : ''} · Goal: {goalLabel || 'next level'}
                </Text>
                {skills.deltaLabel ? (
                  <Text style={[st.modalHint, { color: mint }]}>
                    Trend: {skills.deltaLabel}
                    {skills.avgDelta !== 0
                      ? ` · avg ${skills.avgDelta > 0 ? '+' : ''}${skills.avgDelta} pts`
                      : ''}
                  </Text>
                ) : null}
                <Text style={[st.modalSection, { color: textPri }]}>Skill snapshot (0–100)</Text>
                {(['grammar', 'pronunciation', 'fluency', 'vocabulary'] as const).map((k) => (
                  <View
                    key={k}
                    style={[st.modalRow, { borderBottomColor: `${border}99` }]}
                  >
                    <Text style={[st.modalRowLabel, { color: textSec }]}>
                      {k.charAt(0).toUpperCase() + k.slice(1)}
                    </Text>
                    <Text style={[st.modalRowVal, { color: textPri }]}>
                      {scores[k] ?? '—'}%{formatDelta(k) ? ` (${formatDelta(k)})` : ''}
                    </Text>
                  </View>
                ))}
                <Text style={[st.modalFoot, { color: textMut }]}>
                  Tap a skill chip below for mistakes, wins, and what the number means.
                </Text>
              </>
            ) : (
              <>
                <Text style={[st.modalTitle, { color: textPri }]}>{sheet.label}</Text>
                <Text style={[st.modalScoreLine, { color: textPri }]}>
                  Score: {scores[sheet.detailKey] ?? '—'}%
                  {formatDelta(sheet.detailKey) ? (
                    <Text style={{ color: mint, fontWeight: '600' }}>
                      {' '}
                      ({formatDelta(sheet.detailKey)} vs baseline)
                    </Text>
                  ) : null}
                </Text>
                <Text style={[st.modalSub, { color: textSec }]}>{details[sheet.detailKey]?.subtext ?? ''}</Text>
                {(details[sheet.detailKey]?.items || []).map((line, i) => (
                  <View key={i} style={st.modalBulletRow}>
                    <Text style={[st.modalBullet, { color: accent }]}>•</Text>
                    <Text style={[st.modalBulletText, { color: textPri }]}>{line}</Text>
                  </View>
                ))}
                {mastery && mastery[sheet.detailKey] ? (
                  <View style={[st.modalBadge, { backgroundColor: `${mint}18` }]}>
                    <Text style={[st.modalBadgeText, { color: mint }]}>
                      Achievement: mastery-level in this area (85+)
                    </Text>
                  </View>
                ) : null}
                {skills.hottestSkill === sheet.detailKey ? (
                  <Text style={[st.modalFoot, { color: textMut }]}>This is your strongest recent gain.</Text>
                ) : null}
              </>
            )}
          </ScrollView>
          <TouchableOpacity
            style={[st.modalDone, { backgroundColor: accent }]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={st.modalDoneText}>Got it</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
import { chatApi } from '../../../api/connections';
import SocketService from '../../call/services/socketService';

// ─── Constants ────────────────────────────────────────────────────────────────
const { width: SW } = Dimensions.get('window');
const HPAD = 16;
const CPAD = 20;
const RING_SIZE = 148;
const RING_STROKE = 11;
const RING_RADIUS = (RING_SIZE - RING_STROKE * 2) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

// Slim ring variant (~30% smaller) used by the redesigned ScoreCard.
const RING_SIZE_SLIM = 104;
const RING_STROKE_SLIM = 9;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Phrase { id?: string; phrase: string; definition: string; example: string; }

const LEVEL_ORDER = ['a1','a2','b1','b2','c1','c2'];
type LevelKey = 'a1'|'a2'|'b1'|'b2'|'c1'|'c2';

const PILLAR_ALERT_LABEL: Record<string, string> = {
  pronunciation: 'pronunciation clarity',
  fluency: 'fluency',
  grammar: 'grammar',
  vocabulary: 'vocabulary',
};

function taskMatchesPillar(task: LearningTask, pillar: string): boolean {
  return (task.type || '').toLowerCase() === pillar.toLowerCase();
}

function cefrKey(l: string): LevelKey {
  const k = l.toLowerCase().replace('-','') as LevelKey;
  return LEVEL_ORDER.includes(k) ? k : 'a1';
}
function nextCefr(l: string): string {
  const i = LEVEL_ORDER.indexOf(l.toLowerCase().replace('-',''));
  return i >= 0 && i < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[i+1].toUpperCase() : 'C2';
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skel({ w, h, r = 8, tint }: { w: number|string; h: number; r?: number; tint: string }) {
  const op = useRef(new RNAnimated.Value(0.15)).current;
  useEffect(() => {
    RNAnimated.loop(RNAnimated.sequence([
      RNAnimated.timing(op, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      RNAnimated.timing(op, { toValue: 0.15, duration: 700, useNativeDriver: true }),
    ])).start();
  }, [op]);
  return <RNAnimated.View style={{ width: w as any, height: h, borderRadius: r, backgroundColor: tint, opacity: op }} />;
}

// ─── Progress Ring ────────────────────────────────────────────────────────────
function Ring({
  score,
  primary,
  accent,
  track,
  size = RING_SIZE,
  stroke = RING_STROKE,
}: {
  score: number;
  primary: string;
  accent: string;
  track: string;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * radius;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(350, withTiming(Math.min(score,100)/100, { duration: 1200, easing: Easing.out(Easing.cubic) }));
  }, [score, p]);
  const ap = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - p.value) }));
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Defs>
        <SvgGradient id="rg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={primary} stopOpacity="1" />
          <Stop offset="1" stopColor={accent} stopOpacity="1" />
        </SvgGradient>
      </Defs>
      <Circle cx={size/2} cy={size/2} r={radius} stroke={track} strokeWidth={stroke} fill="none" strokeLinecap="round" />
      <AnimatedCircle cx={size/2} cy={size/2} r={radius} stroke="url(#rg)" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={circ} animatedProps={ap} />
    </Svg>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ url, initials, primary }: { url?: string; initials: string; primary: string }) {
  return (
    <View style={[st.avatar, { borderColor: `${primary}50` }]}>
      {url
        ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} />
        : <LinearGradient colors={[`${primary}CC`, `${primary}55`]} style={[StyleSheet.absoluteFill, { alignItems:'center', justifyContent:'center' }]}>
            <Text style={st.avatarTxt}>{initials}</Text>
          </LinearGradient>
      }
    </View>
  );
}

// ─── Streak flame with ignition + embers ──────────────────────────────────────
const EMBER_COUNT = 4;

function StreakFlame({
  streak,
  igniteOnMount,
  reduceMotion,
}: {
  streak: number;
  igniteOnMount: boolean;
  reduceMotion: boolean;
}) {
  const lit = streak >= 1;
  const hot = streak >= 3;
  const flameColor = !lit ? homeTheme.streakUnlit : hot ? '#FB923C' : homeTheme.streak;

  const scale = useSharedValue(igniteOnMount && lit && !reduceMotion ? 0 : 1);
  // One shared value per ember (progress 0 → 1).
  const emberA = useSharedValue(0);
  const emberB = useSharedValue(0);
  const emberC = useSharedValue(0);
  const emberD = useSharedValue(0);
  const embers = [emberA, emberB, emberC, emberD];

  useEffect(() => {
    if (!igniteOnMount || !lit || reduceMotion) {
      scale.value = 1;
      return;
    }
    // Overshoot spring scale 0 → 1.
    scale.value = withSpring(1, { damping: 7, stiffness: 140, mass: 0.6 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    embers.forEach((e, i) => {
      e.value = 0;
      e.value = withDelay(
        i * 70,
        withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [igniteOnMount, lit, reduceMotion]);

  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={st.flameWrap}>
      <Animated.View style={flameStyle}>
        <Ionicons name="flame" size={19} color={flameColor} />
      </Animated.View>
      {!reduceMotion && lit && igniteOnMount
        ? embers.map((e, i) => <Ember key={i} progress={e} index={i} color={flameColor} />)
        : null}
    </View>
  );
}

function Ember({ progress, index, color }: { progress: ReturnType<typeof useSharedValue<number>>; index: number; color: string }) {
  const driftX = (index - (EMBER_COUNT - 1) / 2) * 6;
  const style = useAnimatedStyle(() => ({
    opacity: progress.value < 0.05 ? 0 : 1 - progress.value,
    transform: [
      { translateY: -30 * progress.value },
      { translateX: driftX * progress.value },
    ],
  }));
  return <Animated.View style={[st.ember, { backgroundColor: color }, style]} />;
}

// ─── Streak + Daily Goal Row ──────────────────────────────────────────────────
function StreakRow({
  streak,
  done,
  target,
  theme,
  igniteOnMount,
  reduceMotion,
}: {
  streak: number;
  done: number;
  target: number;
  theme: any;
  igniteOnMount: boolean;
  reduceMotion: boolean;
}) {
  const c = theme.colors;
  const hot = streak >= 3;
  return (
    <View style={[st.streakRow, { backgroundColor: homeTheme.cardFill, borderColor: homeTheme.cardBorder, borderRadius: theme.borderRadius.l }]}>
      <View style={st.streakLeft}>
        <StreakFlame streak={streak} igniteOnMount={igniteOnMount} reduceMotion={reduceMotion} />
        <Text style={[st.streakNum, { color: streak >= 1 ? (hot ? '#FB923C' : homeTheme.streak) : c.text.primary }]}>{streak}</Text>
        <Text style={[st.streakUnit, { color: c.text.light }]}>{streak === 1 ? 'day' : 'days'}</Text>
      </View>
      <View style={[st.streakDivider, { backgroundColor: c.border }]} />
      <View style={st.streakRight}>
        <View style={st.sessionDots}>
          {Array.from({ length: Math.max(target, 1) }).map((_, i) => (
            <View key={i} style={[st.dot, {
              backgroundColor: i < done ? c.primary : `${c.primary}22`,
              borderColor: i < done ? c.primary : `${c.primary}35`,
              width: 10, height: 10, borderRadius: 5,
            }]} />
          ))}
        </View>
        <Text style={[st.streakUnit, { color: c.text.light, marginLeft: 8 }]}>{done}/{target} today</Text>
      </View>
    </View>
  );
}

// ─── Assessment Nudge (no data state) ────────────────────────────────────────
function AssessmentNudge({ theme, onPress }: { theme: any; onPress: () => void }) {
  const c = theme.colors;
  return (
    <View style={[st.nudgeCard, { backgroundColor: c.surface, borderColor: `${c.primary}35`, borderRadius: theme.borderRadius.xl }]}>
      <LinearGradient colors={[`${c.primary}25`, 'transparent']} style={st.nudgeGlow} />
      <View style={[st.nudgeIcon, { backgroundColor: `${c.primary}18`, borderColor: `${c.primary}35` }]}>
        <Ionicons name="analytics-outline" size={28} color={c.primary} />
      </View>
      <Text style={[st.nudgeTitle, { color: c.text.primary }]}>Discover your level</Text>
      <Text style={[st.nudgeSub, { color: c.text.light }]}>
        Take a free 5-min speaking test to unlock your fluency score and CEFR level.
      </Text>
      <TouchableOpacity activeOpacity={0.82} onPress={onPress} style={{ borderRadius: theme.borderRadius.m, overflow: 'hidden', width: '100%' }}>
        <LinearGradient colors={theme.gradients.primary as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.nudgeBtn}>
          <Ionicons name="mic" size={15} color="#fff" />
          <Text style={st.nudgeBtnTxt}>Take Free Assessment</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ─── Skill Chip ───────────────────────────────────────────────────────────────
function SkillChip({
  label,
  score,
  color,
  onPress,
}: {
  label: string;
  score: number;
  color: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={[st.skillDot, { backgroundColor: color }]} />
      <Text style={[st.skillLabel, { color }]}>{label}</Text>
      <Text style={[st.skillScore, { color }]}>{score}</Text>
      {onPress ? (
        <Ionicons name="information-circle-outline" size={12} color={color} style={{ opacity: 0.7, marginLeft: 2 }} />
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }}
        style={({ pressed }) => [
          st.skillChip,
          { backgroundColor: `${color}12`, borderColor: `${color}30`, opacity: pressed ? 0.88 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label} score details`}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={[st.skillChip, { backgroundColor: `${color}12`, borderColor: `${color}30` }]}>{content}</View>
  );
}

// ─── Score Card ───────────────────────────────────────────────────────────────
function ScoreCard({
  score,
  level,
  progress,
  goalLabel,
  skills,
  theme,
  onResults,
  onRetake,
  onPressOverall,
  onPressSkill,
}: {
  score: number;
  level: string;
  progress: number;
  goalLabel: string;
  skills: Record<string, number>;
  theme: any;
  onResults: () => void;
  onRetake: () => void;
  onPressOverall?: () => void;
  onPressSkill?: (detailKey: SkillDetailKeyV1, label: string) => void;
}) {
  const c = theme.colors;
  const sk = theme.tokens.skill as any;
  const lk = cefrKey(level);
  const lvlColor = (theme.tokens.level as any)?.[lk] ?? c.primary;

  const ringArcScore = score > 100 ? Math.min(100, (score / 1000) * 100) : Math.min(score, 100);
  const scoreDenom = score > 100 ? '/1000' : '/100';

  const chips: { key: SkillDetailKeyV1; label: string; color: string }[] = [
    { key: 'grammar', label: 'Grammar', color: sk?.grammar ?? c.primary },
    { key: 'pronunciation', label: 'Pronun.', color: sk?.pronunciation ?? c.accent },
    { key: 'fluency', label: 'Fluency', color: sk?.fluency ?? c.success },
    { key: 'vocabulary', label: 'Vocab', color: sk?.vocabulary ?? c.warning },
  ];

  return (
    <View
      style={[
        st.scoreCard,
        {
          backgroundColor: homeTheme.cardFill,
          borderColor: homeTheme.cardBorder,
          borderRadius: homeTheme.cardRadius,
        },
      ]}
    >
      {/* Top: ring + right-side info */}
      <Pressable
        onPress={
          onPressOverall
            ? () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onPressOverall();
              }
            : undefined
        }
        disabled={!onPressOverall}
        style={({ pressed }) => [
          st.scoreTop,
          onPressOverall && pressed && { transform: [{ scale: homeTheme.pressScale }], opacity: 0.95 },
        ]}
        accessibilityRole={onPressOverall ? 'button' : undefined}
        accessibilityLabel={onPressOverall ? 'Overall score details' : undefined}
      >
        <View style={st.ringWrapSlim}>
          <Ring
            score={ringArcScore}
            primary={c.primary}
            accent={c.accent}
            track={`${c.border}80`}
            size={RING_SIZE_SLIM}
            stroke={RING_STROKE_SLIM}
          />
          <View style={st.ringInner} pointerEvents="none">
            <Text style={[st.scoreNumSlim, { color: c.text.primary }]}>{Math.round(score)}</Text>
            <Text style={[st.scoreDenom, { color: c.text.light }]}>{scoreDenom}</Text>
          </View>
        </View>

        <View style={st.scoreInfo}>
          <View style={st.overallRow}>
            <Text style={[st.overallTxt, { color: c.text.secondary }]}>Overall</Text>
            <Ionicons name="information-circle-outline" size={13} color={c.text.light} style={{ marginLeft: 3 }} />
          </View>
          <View style={[st.cefrBadge, { backgroundColor: `${lvlColor}20`, borderColor: `${lvlColor}55` }]}>
            <Text style={[st.cefrTxt, { color: lvlColor }]}>{level.toUpperCase()}</Text>
          </View>
          <Text style={[st.progressTxt, { color: c.text.light }]}>{progress}% to {goalLabel.toUpperCase()}</Text>
          {/* Mini progress bar */}
          <View style={[st.progressTrack, { backgroundColor: `${c.primary}18` }]}>
            <LinearGradient colors={[c.primary, c.accent] as any} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={[st.progressFill, { width: `${Math.min(progress,100)}%` }]} />
          </View>
        </View>
      </Pressable>

      {/* Skill chips — single horizontal row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.skillRow}
      >
        {chips.map((ch) => (
          <SkillChip
            key={ch.key}
            label={ch.label}
            score={skills[ch.key] ?? 0}
            color={ch.color}
            onPress={
              onPressSkill
                ? () => onPressSkill(ch.key, ch.label === 'Pronun.' ? 'Pronunciation' : ch.label)
                : undefined
            }
          />
        ))}
      </ScrollView>

      {/* Buttons */}
      <View style={st.btnRow}>
        <TouchableOpacity onPress={onResults} activeOpacity={0.75} style={[st.outBtn, { borderColor: `${c.primary}65`, flex: 1 }]}>
          <Ionicons name="stats-chart-outline" size={13} color={c.text.accent} style={{ marginRight: 5 }} />
          <Text style={[st.outBtnTxt, { color: c.text.accent }]}>Results</Text>
        </TouchableOpacity>
        <View style={{ width: 10 }} />
        <TouchableOpacity onPress={onRetake} activeOpacity={0.75} style={[st.outBtn, { borderColor: `${c.primary}65`, flex: 1 }]}>
          <Ionicons name="refresh-outline" size={13} color={c.text.accent} style={{ marginRight: 5 }} />
          <Text style={[st.outBtnTxt, { color: c.text.accent }]}>Retake</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Score Card Skeleton ──────────────────────────────────────────────────────
function ScoreSkeleton({ theme }: { theme: any }) {
  const c = theme.colors;
  const t = `${c.primary}25`;
  return (
    <View style={[st.scoreCard, { backgroundColor: c.surface, borderColor: c.border, borderRadius: theme.borderRadius.xl, gap: 16 }]}>
      <View style={st.scoreTop}>
        <Skel w={RING_SIZE} h={RING_SIZE} r={RING_SIZE/2} tint={t} />
        <View style={[st.scoreInfo, { gap: 10 }]}>
          <Skel w={60} h={11} tint={t} />
          <Skel w={44} h={26} r={6} tint={t} />
          <Skel w={100} h={10} tint={t} />
          <Skel w="100%" h={5} r={3} tint={t} />
        </View>
      </View>
      <View style={st.skillGrid}>
        {[0,1,2,3].map(i => <Skel key={i} w="47%" h={34} r={8} tint={t} />)}
      </View>
      <View style={{ flexDirection:'row', gap:10 }}>
        <Skel w="47%" h={42} r={10} tint={t} />
        <Skel w="47%" h={42} r={10} tint={t} />
      </View>
    </View>
  );
}

// ─── Phrase Card ──────────────────────────────────────────────────────────────
function PhraseCard({ phrase, theme, onPractice }: { phrase: Phrase; theme: any; onPractice: () => void }) {
  const c = theme.colors;
  return (
    <View style={[st.phraseCard, { backgroundColor: c.surface, borderColor: c.border, borderRadius: theme.borderRadius.l, width: SW - HPAD * 2 }]}>
      <View style={st.phraseTop}>
        <Text style={[st.phraseEye, { color: c.warning, fontSize: theme.typography.sizes.xs }]}>PHRASE OF THE DAY</Text>
        <View style={[st.phraseIconWrap, { backgroundColor: `${c.warning}20` }]}>
          <Ionicons name="chatbubble-ellipses" size={13} color={c.warning} />
        </View>
      </View>
      <Text style={[st.phraseTitle, { color: c.text.primary, fontSize: theme.typography.sizes.xl }]}>{phrase.phrase}</Text>
      <Text style={[st.phraseDef, { color: c.text.light, fontSize: theme.typography.sizes.s }]}>{phrase.definition}</Text>
      <View style={[st.quoteBlock, { backgroundColor: `${c.primary}0E`, borderLeftColor: c.primary, borderRadius: theme.borderRadius.s }]}>
        <Text style={[st.quoteText, { color: c.text.secondary, fontSize: theme.typography.sizes.s }]}>"{phrase.example}"</Text>
      </View>
      <TouchableOpacity activeOpacity={0.82} onPress={onPractice} style={{ borderRadius: theme.borderRadius.m, overflow: 'hidden' }}>
        <LinearGradient colors={theme.gradients.primary as any} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={st.phraseBtn}>
          <Ionicons name="mic" size={14} color="#fff" style={{ marginRight: 6 }} />
          <Text style={[st.phraseBtnTxt, { fontSize: theme.typography.sizes.m }]}>Practice It</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ─── Phrase Skeleton ──────────────────────────────────────────────────────────
function PhraseSkeleton({ theme }: { theme: any }) {
  const c = theme.colors;
  const t = `${c.primary}25`;
  return (
    <View style={[st.phraseCard, { backgroundColor: c.surface, borderColor: c.border, borderRadius: theme.borderRadius.l, width: SW - HPAD * 2, gap: 12 }]}>
      <Skel w={110} h={11} tint={t} />
      <Skel w="68%" h={26} r={5} tint={t} />
      <Skel w="100%" h={13} tint={t} />
      <Skel w="100%" h={54} r={8} tint={t} />
      <Skel w="100%" h={44} r={10} tint={t} />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
function timeGreeting(name?: string): string {
  const h = new Date().getHours();
  const who = name ? `, ${name}` : '';
  if (h >= 23 || h < 4) return `Still up${who}? 🌙`;
  if (h < 12) return `Good morning${who}`;
  if (h < 18) return `Good afternoon${who}`;
  return `Good evening${who}`;
}

export default function HomeScreen() {
  const { theme } = useTheme();
  const { user, isLoaded } = useUser();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const socketService = useRef(SocketService.getInstance()).current;
  const carouselRef = useRef<PulseHomeCarouselHandle>(null);

  const [homeData, setHomeData]       = useState<HomeData | null>(() =>
    HomeCacheService.getInstance().getSnapshot(),
  );
  const [bridgeHeader, setBridgeHeader] = useState<{ level?: string; streak?: number }>({});
  const [loadingHome, setLoadingHome] = useState(
    () => !HomeCacheService.getInstance().hasSnapshot(),
  );
  const [refreshingHome, setRefreshingHome] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [skillSheet, setSkillSheet] = useState<SkillSheetStateV1>(null);
  const [homeScrollEnabled, setHomeScrollEnabled] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [listenVoice, setListenVoice] = useState<DailyListenVoice>('Kiki');
  const [showVoicePicker, setShowVoicePicker] = useState(false);

  // Entry choreography fires ONCE per cold land, not on every tab refocus.
  const hasPlayedEntry = useRef(false);
  const playEntry = !reduceMotion && !hasPlayedEntry.current;

  const c = theme.colors;

  // ── Reduce-motion accessibility preference ─────────────────────────────────
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (alive) setReduceMotion(Boolean(enabled));
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(Boolean(enabled));
    });
    return () => {
      alive = false;
      // RN >= 0.65 returns a subscription with remove(); guard for older shapes.
      (sub as any)?.remove?.();
    };
  }, []);

  // Mark entry as played after first render so refocus renders the final state.
  useEffect(() => {
    hasPlayedEntry.current = true;
  }, []);

  useEffect(() => {
    const pref = homeData?.listenVoicePreference;
    if (!pref) return;
    setListenVoice(pref.voice);
    setShowVoicePicker(!pref.chosen);
  }, [homeData?.listenVoicePreference]);

  const loadHome = useCallback(async (options?: { forceFresh?: boolean }) => {
    const forceFresh = options?.forceFresh === true;
    const homeCache = HomeCacheService.getInstance();
    let datedDaily = await getDailyContentForToday();

    const mergeDailyFields = (data: HomeData): HomeData => ({
      ...data,
      phraseOfTheDay:
        mergeDailyPhraseFields(datedDaily?.phraseOfTheDay, data.phraseOfTheDay) ??
        data.phraseOfTheDay,
      wordOfTheDay:
        mergeDailyWordFields(datedDaily?.wordOfTheDay, data.wordOfTheDay) ??
        data.wordOfTheDay,
    });

    if (!forceFresh) {
      const memory = homeCache.getSnapshot() ?? (await homeCache.hydrateFromDisk());
      if (memory) {
        setHomeData(mergeDailyFields(memory));
        setLoadingHome(false);
      } else {
        try {
          const cached = await AsyncStorage.getItem(HOME_DATA_CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached) as HomeData & { _cachedUtcDate?: string };
            const { phraseOfTheDay: _hp, wordOfTheDay: _hw, ...parsedRest } = parsed;
            const merged = mergeHomeWithDailyContent(
              parsedRest as unknown as Record<string, unknown>,
              parsed._cachedUtcDate,
              datedDaily,
            ) as unknown as HomeData;
            const withDaily = mergeDailyFields(merged);
            homeCache.setSnapshot(withDaily);
            setHomeData(withDaily);
            setLoadingHome(false);
          } else if (!homeCache.hasSnapshot()) {
            setLoadingHome(true);
          }
        } catch {
          if (!homeCache.hasSnapshot()) setLoadingHome(true);
        }
      }
    }
    // Pull-to-refresh: keep showing cached content; only the RefreshControl spinner.

    try {
      let token = await getNestAuthToken();
      for (let i = 0; i < 4 && !token; i += 1) {
        await new Promise((r) => setTimeout(r, 350));
        token = await getNestAuthToken();
      }
      if (!token) {
        console.warn('[HomeV1] home fetch skipped — no auth token yet');
        return;
      }

      const fresh = await getHomeData();
      datedDaily = await getDailyContentForToday();
      const withDaily = await homeCache.persistFresh(fresh);
      setHomeData(mergeDailyFields(withDaily));
      if (forceFresh) {
        void tasksApi.loadPracticeCarouselTasks().catch(() => {});
      }
    } catch (e) {
      console.warn('[HomeV1] home data:', e);
    } finally {
      setLoadingHome(false);
      setRefreshingHome(false);
    }
  }, []);

  const onRefreshHome = useCallback(() => {
    setRefreshingHome(true);
    setHomeScrollEnabled(true);
    void loadHome({ forceFresh: true });
  }, [loadHome]);

  // ── Fetch home data (stale-while-revalidate) ───────────────────────────────
  useFocusEffect(
    useCallback(() => {
      setHomeScrollEnabled(true);
      void loadHome();
      return () => {
        setHomeScrollEnabled(true);
      };
    }, [loadHome]),
  );

  // Live-update phrase/word when a daily push arrives in foreground.
  useEffect(() => {
    return onDailyContentUpdated((snapshot) => {
      setHomeData((prev) => {
        if (!prev || snapshot.date !== utcTodayKey()) return prev;
        return {
          ...prev,
          ...(snapshot.phraseOfTheDay !== undefined && snapshot.phraseOfTheDay !== null
            ? { phraseOfTheDay: snapshot.phraseOfTheDay }
            : {}),
          ...(snapshot.wordOfTheDay !== undefined && snapshot.wordOfTheDay !== null
            ? { wordOfTheDay: snapshot.wordOfTheDay }
            : {}),
        };
      });
    });
  }, []);

  // Phrase/word-of-day notification tap → scroll carousel to matching slide.
  useEffect(() => {
    const target = route.params?.scrollToDaily as string | undefined;
    if (!target) return;
    const kind = target === 'word' ? 'word_daily' : 'phrase_daily';
    const timer = setTimeout(() => {
      carouselRef.current?.scrollToSlideKind(kind);
      navigation.setParams({ scrollToDaily: undefined });
    }, 400);
    return () => clearTimeout(timer);
  }, [route.params?.scrollToDaily, navigation]);

  // ── Bridge overlay (shared CEFR / streak with Englivo mode) ────────────────
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      getBridgeUser(user.id)
        .then((b) => {
          if (!b) return;
          setBridgeHeader({
            level: b.cefrLevel ?? b.cefr_level,
            streak:
              typeof (b.streakDays ?? b.streak_days) === 'number'
                ? (b.streakDays ?? b.streak_days)
                : undefined,
          });
        })
        .catch(() => {});
    }, [user?.id]),
  );

  // ── Fetch unread chat count + realtime updates ────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let alive = true;

      const fetchUnread = async () => {
        try {
          const unread = await chatApi.getUnreadCount();
          if (!alive) return;
          setUnreadChatCount(Number(unread?.count ?? 0));
        } catch (e) {
          console.warn('[HomeV1] unread count:', e);
        }
      };

      void fetchUnread();

      const handleNewMessage = () => {
        // Keep badge in sync while user is on home.
        void fetchUnread();
      };

      socketService.onNewMessage(handleNewMessage);

      return () => {
        alive = false;
        socketService.offNewMessage(handleNewMessage);
      };
    }, [socketService]),
  );

  // ── Derived values ─────────────────────────────────────────────────────────
  const scoreRaw  = homeData?.header.score;
  const score     = Number(scoreRaw ?? 0);
  const nestLevel = (homeData?.header.level ?? '').trim();
  const bridgeLevel = (bridgeHeader.level ?? '').trim();
  const level     = nestLevel || bridgeLevel;
  const goalTgt   = homeData?.header.goalTarget ?? 100;
  const goalLabel = homeData?.header.goalLabel ?? (level ? nextCefr(level) : 'Next Level');
  const streak    = bridgeHeader.streak ?? homeData?.header.streak ?? 0;
  const done      = homeData?.header.dailyGoalDone ?? 0;
  const target    = homeData?.header.dailyGoalTarget ?? 3;
  const latestId  = homeData?.header.latestAssessmentId ?? null;
  const lastSessionDate = homeData?.header.lastSessionDate ?? null;
  const skills    = homeData?.skills?.scores ?? {};
  const avgSkillScore = Number(homeData?.skills?.avgScore ?? 0);

  const progress     = goalTgt > 0 ? Math.min(Math.round((score / goalTgt) * 100), 99) : 0;
  const hasMeaningfulLevel = level.length > 0 && level !== '—' && level !== '--';
  const hasSkillScores = Object.values(skills).some((v) => Number(v) > 0) || avgSkillScore > 0;
  const hasData =
    score > 0 ||
    Boolean(latestId) ||
    hasMeaningfulLevel ||
    Boolean(lastSessionDate) ||
    hasSkillScores ||
    (homeData?.stage ?? 0) > 1 ||
    Boolean(bridgeLevel);
  const levelForUi   = level || '—';
  const initials     = `${user?.firstName?.charAt(0) ?? ''}${user?.lastName?.charAt(0) ?? ''}`.toUpperCase() || '?';

  // ── Community (peer presence) ──────────────────────────────────────────────
  const onlineCount = homeData?.community?.onlineCount ?? 0;
  const communityAvatars = homeData?.community?.avatars ?? [];

  // ── Weakest pillar (lowest of the four skill scores; null if all 0 / empty) ─
  const weakestPillar = (() => {
    const keys: SkillDetailKeyV1[] = ['grammar', 'pronunciation', 'fluency', 'vocabulary'];
    const present = keys
      .map((k) => ({ k, v: Number(skills[k] ?? 0) }))
      .filter((e) => Number.isFinite(e.v));
    if (present.length === 0) return null;
    // New user with no calls: every pillar 0 → hide the card.
    if (present.every((e) => e.v <= 0)) return null;
    let lowest = present[0];
    for (const e of present) {
      if (e.v < lowest.v) lowest = e;
    }
    return lowest.k as string;
  })();

  // ── Handlers ───────────────────────────────────────────────────────────────
  const goResults  = () => latestId ? navigation.navigate('AssessmentResult', { sessionId: latestId }) : navigation.navigate('AssessmentIntro');
  const goRetake   = () => navigation.navigate('AssessmentIntro');
  const goAssess   = () => navigation.navigate('AssessmentIntro');
  const goChat     = () => navigation.navigate('Conversations');
  const goNotifs   = () => navigation.navigate('Notifications');
  const goPracticeCall = () => navigation.navigate('CallPreference');

  // Hero secondary CTA — warm up with Maya when no partner is available.
  const goMayaFallback = useCallback(() => {
    navigation.navigate('MayaTutor', { source: 'home_fallback' });
  }, [navigation]);

  // Mistakes card — practice the weakest pillar; skip tasks already on the carousel.
  const goMistakesPractice = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const focus = (weakestPillar ?? '').toLowerCase();
    if (!focus) {
      Alert.alert(
        'No practice tasks yet',
        'Complete a call with Maya or a partner to get personalized fixes.',
      );
      return;
    }

    try {
      const [carouselTasks, dueTasks, pendingTasks] = await Promise.all([
        tasksApi.loadPracticeCarouselTasks(),
        tasksApi.getDueTasks(),
        tasksApi.getPendingTasks().catch(() => [] as LearningTask[]),
      ]);
      const carouselIds = new Set(carouselTasks.map((t) => t.id));
      const offCarousel = dueTasks.find(
        (t) => taskMatchesPillar(t, focus) && !carouselIds.has(t.id),
      );

      if (offCarousel) {
        navigation.navigate('PracticeTask', {
          task: offCarousel,
          source: 'home_mistakes',
          focus,
        });
        return;
      }

      const onCarousel = carouselTasks.find((t) => taskMatchesPillar(t, focus));
      if (onCarousel) {
        carouselRef.current?.scrollToPillar(focus);
        const pillarLabel = PILLAR_ALERT_LABEL[focus] ?? focus;
        Alert.alert('Practice in carousel', `Your ${pillarLabel} fixes are in the carousel below`);
        return;
      }

      const anyDue = dueTasks.find((t) => taskMatchesPillar(t, focus));
      if (anyDue) {
        navigation.navigate('PracticeTask', {
          task: anyDue,
          source: 'home_mistakes',
          focus,
        });
        return;
      }

      const pendingMatch = pendingTasks.find((t) => taskMatchesPillar(t, focus));
      if (pendingMatch) {
        navigation.navigate('PracticeTask', {
          task: pendingMatch,
          source: 'home_mistakes',
          focus,
        });
        return;
      }

      const anyTask = dueTasks[0] ?? pendingTasks[0] ?? carouselTasks[0];
      if (anyTask) {
        navigation.navigate('PracticeTask', {
          task: anyTask,
          source: 'home_mistakes',
          focus,
        });
        return;
      }
    } catch {
      /* fall through to user message */
    }

    Alert.alert(
      'No practice tasks yet',
      'Complete a call with Maya or a partner — we will turn your mistakes into practice cards.',
    );
  }, [navigation, weakestPillar]);

  // ── Entry choreography (cascade) ───────────────────────────────────────────
  const { cascadeStart, cascadeStagger, cascadeDuration } = homeTheme.entry;
  // Greeting 0, then hero / mistakes / score / carousel staggered.
  const enterAt = (slot: number) =>
    FadeInDown.delay(cascadeStart + slot * cascadeStagger).duration(cascadeDuration).springify();
  const enterGreeting = FadeInDown.delay(homeTheme.entry.greeting.delay)
    .duration(homeTheme.entry.greeting.duration)
    .springify();

  return (
    <View style={[st.root, { backgroundColor: homeTheme.canvas }]}>
      <StatusBar style="light" backgroundColor={homeTheme.canvas} />

      <ScrollView
        style={[st.scroll, { backgroundColor: homeTheme.canvas }]}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 104, paddingHorizontal: HPAD, gap: 14 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={homeScrollEnabled}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshingHome}
            onRefresh={onRefreshHome}
            tintColor={c.primary}
            colors={[c.primary]}
          />
        }
      >
        {/* ── Header (greeting) ──────────────────────────────────────────── */}
        <Animated.View entering={playEntry ? enterGreeting : undefined} style={st.header}>
          {isLoaded
            ? <Avatar url={user?.imageUrl} initials={initials} primary={c.primary} />
            : <View style={[st.avatar, { borderColor: `${c.primary}28`, backgroundColor: `${c.primary}15` }]} />
          }
          <View style={st.switcher}>
            {isLoaded && user?.firstName ? (
              <Text style={{ fontSize: 11, color: c.text.light, fontWeight: '600', marginBottom: 2 }} numberOfLines={1}>
                {timeGreeting(user.firstName)}
              </Text>
            ) : null}
            <ModeSwitcher />
          </View>
          <View style={st.actions}>
            <Pressable onPress={goChat} style={[st.iconBtn, { backgroundColor: `${c.primary}14`, borderColor: `${c.primary}28` }]} accessibilityLabel="Chat">
              <Ionicons name="chatbubble-outline" size={18} color={c.primary} />
              {unreadChatCount > 0 && (
                <View style={[st.iconBadge, { backgroundColor: c.primary }]}>
                  <Text style={st.iconBadgeTxt}>
                    {unreadChatCount > 9 ? '9+' : unreadChatCount}
                  </Text>
                </View>
              )}
            </Pressable>
            <Pressable onPress={goNotifs} style={[st.iconBtn, { backgroundColor: `${c.primary}14`, borderColor: `${c.primary}28` }]} accessibilityLabel="Notifications">
              <Ionicons name="notifications-outline" size={18} color={c.primary} />
            </Pressable>
          </View>
        </Animated.View>

        {/* ── Streak Row ──────────────────────────────────────────────────── */}
        {/* ── Streak Row (flame ignites on cold land) ─────────────────────── */}
        {!loadingHome && (
          <Animated.View entering={playEntry ? enterGreeting : undefined}>
            <StreakRow
              streak={streak}
              done={done}
              target={target}
              theme={theme}
              igniteOnMount={playEntry}
              reduceMotion={reduceMotion}
            />
          </Animated.View>
        )}

        {/* ── Connect hero (peer-first CTA) ───────────────────────────────── */}
        {!loadingHome && (
          <Animated.View entering={playEntry ? enterAt(0) : undefined}>
            <ConnectHeroCard
              onlineCount={onlineCount}
              avatars={communityAvatars}
              onFindPartner={goPracticeCall}
              onMayaFallback={goMayaFallback}
              reduceMotion={reduceMotion}
            />
          </Animated.View>
        )}

        {/* ── Mistakes card (hides itself when no weakest pillar) ─────────── */}
        {!loadingHome && (
          <Animated.View entering={playEntry ? enterAt(1) : undefined}>
            <MistakesCard weakestPillar={weakestPillar} onPractice={goMistakesPractice} />
          </Animated.View>
        )}

        {/* ── Score Card / Nudge (slim) ───────────────────────────────────── */}
        {loadingHome ? (
          <Animated.View entering={FadeIn.delay(60).duration(260)}>
            <ScoreSkeleton theme={theme} />
          </Animated.View>
        ) : hasData ? (
          <Animated.View entering={playEntry ? enterAt(2) : undefined}>
            <ScoreCard
              score={score}
              level={levelForUi}
              progress={progress}
              goalLabel={goalLabel}
              skills={skills}
              theme={theme}
              onResults={goResults}
              onRetake={goRetake}
              onPressOverall={() => setSkillSheet({ type: 'overall' })}
              onPressSkill={(detailKey, label) => setSkillSheet({ type: 'skill', detailKey, label })}
            />
          </Animated.View>
        ) : (
          <Animated.View entering={playEntry ? enterAt(2) : undefined}>
            <AssessmentNudge theme={theme} onPress={goAssess} />
          </Animated.View>
        )}

        {/* ── Phrase carousel ─────────────────────────────────────────────── */}
        <Animated.View entering={playEntry ? enterAt(3) : undefined} style={{ gap: 10 }}>
          <PulseHomeCarousel
            ref={carouselRef}
            phraseOfTheDay={homeData?.phraseOfTheDay ?? null}
            wordOfTheDay={homeData?.wordOfTheDay ?? null}
            listenVoice={listenVoice}
            dailyPracticeStatus={homeData?.dailyPracticeStatus ?? null}
            loadingPhrase={loadingHome}
            onParentScrollEnabledChange={setHomeScrollEnabled}
          />
        </Animated.View>
      </ScrollView>

      <DailyListenVoiceModal
        visible={showVoicePicker}
        onSkip={() => {
          setListenVoice('Kiki');
          setShowVoicePicker(false);
        }}
        onComplete={(voice) => {
          setListenVoice(voice);
          setShowVoicePicker(false);
          setHomeData((prev) =>
            prev
              ? {
                  ...prev,
                  listenVoicePreference: { voice, chosen: true },
                }
              : prev,
          );
        }}
      />

      <HomeSkillDetailModalV1
        visible={skillSheet !== null}
        onClose={() => setSkillSheet(null)}
        sheet={skillSheet}
        skills={homeData?.skills}
        headerScore={score}
        goalLabel={goalLabel}
        theme={theme}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },

  // Header
  header: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom: 2 },
  avatar: { width:42, height:42, borderRadius:21, borderWidth:2, overflow:'hidden' },
  avatarTxt: { color:'#fff', fontSize:15, fontWeight:'700' },
  switcher: { flex:1, marginHorizontal:10, maxWidth:210, alignSelf:'center' },
  actions: { flexDirection:'row', gap:8 },
  iconBtn: { width:38, height:38, borderRadius:19, borderWidth:1, alignItems:'center', justifyContent:'center', position:'relative' },
  iconBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  iconBadgeTxt: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 11,
  },

  // Streak
  streakRow: { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:13, borderWidth:1 },
  streakLeft: { flexDirection:'row', alignItems:'center', gap:6 },
  flameWrap: { width:22, height:22, alignItems:'center', justifyContent:'center' },
  ember: { position:'absolute', bottom:6, left:8, width:6, height:6, borderRadius:3 },
  streakNum: { fontSize:18, fontWeight:'800', letterSpacing:-0.5 },
  streakUnit: { fontSize:12, fontWeight:'500' },
  streakDivider: { width:1, height:22, marginHorizontal:14 },
  streakRight: { flex:1, flexDirection:'row', alignItems:'center' },
  sessionDots: { flexDirection:'row', gap:6 },
  dot: { borderWidth:1.5 },

  // Nudge
  nudgeCard: { borderWidth:1, padding:CPAD, alignItems:'center', gap:14 },
  nudgeGlow: { position:'absolute', top:-50, left:-50, width:200, height:200, borderRadius:100 },
  nudgeIcon: { width:62, height:62, borderRadius:31, borderWidth:1, alignItems:'center', justifyContent:'center' },
  nudgeTitle: { fontSize:20, fontWeight:'800', letterSpacing:-0.4, textAlign:'center' },
  nudgeSub: { fontSize:13, lineHeight:20, textAlign:'center', paddingHorizontal:8 },
  nudgeBtn: { flexDirection:'row', alignItems:'center', justifyContent:'center', paddingVertical:14, borderRadius:10, gap:8 },
  nudgeBtnTxt: { color:'#fff', fontSize:15, fontWeight:'700', letterSpacing:0.2 },

  // Score card
  scoreCard: { borderWidth:1, padding:CPAD, gap:16 },
  scoreTop: { flexDirection:'row', alignItems:'center', gap:16 },
  ringWrap: { width:RING_SIZE, height:RING_SIZE, alignItems:'center', justifyContent:'center' },
  ringWrapSlim: { width:RING_SIZE_SLIM, height:RING_SIZE_SLIM, alignItems:'center', justifyContent:'center' },
  ringInner: { position:'absolute', top:0, left:0, right:0, bottom:0, alignItems:'center', justifyContent:'center' },
  scoreNum: { fontSize:36, fontWeight:'800', lineHeight:42, letterSpacing:-1 },
  scoreNumSlim: { fontSize:28, fontWeight:'800', lineHeight:32, letterSpacing:-1 },
  scoreDenom: { fontSize:13, marginTop:-2 },
  scoreInfo: { flex:1, gap:8 },
  overallRow: { flexDirection:'row', alignItems:'center' },
  overallTxt: { fontSize:12, fontWeight:'600', letterSpacing:0.2 },
  cefrBadge: { borderWidth:1, borderRadius:8, paddingHorizontal:10, paddingVertical:4, alignSelf:'flex-start' },
  cefrTxt: { fontSize:12, fontWeight:'800', letterSpacing:0.5 },
  progressTxt: { fontSize:11, fontWeight:'500' },
  progressTrack: { height:5, borderRadius:3, overflow:'hidden' },
  progressFill: { height:'100%', borderRadius:3 },

  // Skill chips
  skillGrid: { flexDirection:'row', flexWrap:'wrap', gap:8 },
  skillRow: { flexDirection:'row', alignItems:'center', gap:8, paddingRight:4 },
  skillChip: { flexDirection:'row', alignItems:'center', paddingHorizontal:10, paddingVertical:7, borderRadius:8, borderWidth:1, gap:5 },
  skillDot: { width:7, height:7, borderRadius:4 },
  skillLabel: { fontSize:11, fontWeight:'600' },
  skillScore: { fontSize:12, fontWeight:'800' },

  // Buttons
  btnRow: { flexDirection:'row' },
  outBtn: { flexDirection:'row', alignItems:'center', justifyContent:'center', borderWidth:1.5, borderRadius:10, paddingVertical:11 },
  outBtnTxt: { fontSize:13, fontWeight:'700', letterSpacing:0.2 },

  // Call card
  callCard: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:20, paddingHorizontal:CPAD, overflow:'hidden' },
  callBlob: { position:'absolute', width:150, height:150, borderRadius:75, top:-45, right:-20 },
  callBody: { gap:4, flex:1 },
  callEye: { fontSize:10, fontWeight:'800', color:'rgba(255,255,255,0.6)', letterSpacing:1.5 },
  callTitle: { fontSize:22, fontWeight:'800', color:'#fff', letterSpacing:-0.5 },
  callSub: { fontSize:13, color:'rgba(255,255,255,0.7)', fontWeight:'500' },
  callIcon: { width:50, height:50, borderRadius:25, alignItems:'center', justifyContent:'center' },

  // Phrase
  phraseCard: { borderWidth:1, padding:CPAD, gap:12 },
  phraseTop: { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  phraseEye: { fontWeight:'800', letterSpacing:1.2 },
  phraseIconWrap: { width:26, height:26, borderRadius:13, alignItems:'center', justifyContent:'center' },
  phraseTitle: { fontWeight:'700', lineHeight:30 },
  phraseDef: { lineHeight:20 },
  quoteBlock: { borderLeftWidth:3, paddingLeft:12, paddingVertical:10, paddingRight:10 },
  quoteText: { fontStyle:'italic', lineHeight:20 },
  phraseBtn: { flexDirection:'row', alignItems:'center', justifyContent:'center', paddingVertical:13, borderRadius:10 },
  phraseBtnTxt: { color:'#fff', fontWeight:'700', letterSpacing:0.3 },

  // Pagination
  paginationRow: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5 },
  pagDot: { height:6, borderRadius:3 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    maxHeight: '78%',
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  modalMeta: {
    fontSize: 13,
    marginBottom: 8,
  },
  modalHint: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  modalSection: {
    fontWeight: '700',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalRowLabel: { fontSize: 14 },
  modalRowVal: { fontSize: 14, fontWeight: '600' },
  modalFoot: {
    fontSize: 12,
    marginTop: 14,
    lineHeight: 17,
  },
  modalScoreLine: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalSub: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  modalBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  modalBullet: { fontSize: 15, marginTop: 1 },
  modalBulletText: { flex: 1, fontSize: 14, lineHeight: 20 },
  modalBadge: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
  },
  modalBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalDone: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalDoneText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
});
