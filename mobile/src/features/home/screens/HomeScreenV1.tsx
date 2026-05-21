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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useUser } from '@clerk/clerk-expo';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
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
  withRepeat,
  withSequence,
  FadeInDown,
  FadeIn,
  Easing,
} from 'react-native-reanimated';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../../theme/ThemeProvider';
import { ModeSwitcher } from '../../../components/navigation/ModeSwitcher';
import PulseHomeCarousel from '../../../components/home/PulseHomeCarousel';
import { FeedbackReadyCard } from '../../../components/home/FeedbackReadyCard';
import { getHomeData, HomeData } from '../services/homeApi';
import { sessionsApi, ConversationSession } from '../../../api/sessions';

const HOME_DATA_CACHE_KEY = '@home_data_cache_v2';

const STALE_RESUME_CTA = /pick up where you left|saved your progress|restart my journey/i;

function resolvePracticeCta(cta?: HomeData['primaryCTA']) {
  const blob = `${cta?.title ?? ''} ${cta?.description ?? ''} ${cta?.buttonText ?? ''}`;
  if (!cta?.title?.trim() || cta.type === 'restart_journey' || STALE_RESUME_CTA.test(blob)) {
    return {
      title: 'Start a practice call',
      description: 'Get matched with someone new — every call is a live conversation',
      buttonText: 'Find a Partner',
    };
  }
  return {
    title: cta.title.trim(),
    description:
      cta.description?.trim() || 'Match with a partner or warm up with Maya first.',
    buttonText: cta.buttonText?.trim() || 'Start a Call',
  };
}
const feedbackSeenKey = (sessionId: string) => `@feedback_seen_${sessionId}`;

let Haptics: { impactAsync: (s: unknown) => Promise<void>; ImpactFeedbackStyle: { Light: string } } = {
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: 'light' },
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
import { getPhraseOfTheDay } from '../../../data/phraseOfTheDay';
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

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Types ────────────────────────────────────────────────────────────────────
interface Phrase { id?: string; phrase: string; definition: string; example: string; }

const LEVEL_ORDER = ['a1','a2','b1','b2','c1','c2'];
type LevelKey = 'a1'|'a2'|'b1'|'b2'|'c1'|'c2';

function cefrKey(l: string): LevelKey {
  const k = l.toLowerCase().replace('-','') as LevelKey;
  return LEVEL_ORDER.includes(k) ? k : 'a1';
}
function nextCefr(l: string): string {
  const i = LEVEL_ORDER.indexOf(l.toLowerCase().replace('-',''));
  return i >= 0 && i < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[i+1].toUpperCase() : 'C2';
}

// ─── Pulse hook (call card glow) ──────────────────────────────────────────────
function usePulse(lo = 0.3, hi = 0.75, ms = 1800) {
  const v = useSharedValue(lo);
  useEffect(() => {
    v.value = withRepeat(
      withSequence(
        withTiming(hi, { duration: ms, easing: Easing.inOut(Easing.sin) }),
        withTiming(lo, { duration: ms, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    );
  }, [v, lo, hi, ms]);
  return v;
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
function Ring({ score, primary, accent, track }: { score: number; primary: string; accent: string; track: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(350, withTiming(Math.min(score,100)/100, { duration: 1200, easing: Easing.out(Easing.cubic) }));
  }, [score, p]);
  const ap = useAnimatedProps(() => ({ strokeDashoffset: RING_CIRC * (1 - p.value) }));
  return (
    <Svg width={RING_SIZE} height={RING_SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Defs>
        <SvgGradient id="rg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={primary} stopOpacity="1" />
          <Stop offset="1" stopColor={accent} stopOpacity="1" />
        </SvgGradient>
      </Defs>
      <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={RING_RADIUS} stroke={track} strokeWidth={RING_STROKE} fill="none" strokeLinecap="round" />
      <AnimatedCircle cx={RING_SIZE/2} cy={RING_SIZE/2} r={RING_RADIUS} stroke="url(#rg)" strokeWidth={RING_STROKE} fill="none" strokeLinecap="round" strokeDasharray={RING_CIRC} animatedProps={ap} />
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

// ─── Streak + Daily Goal Row ──────────────────────────────────────────────────
function StreakRow({ streak, done, target, theme }: { streak: number; done: number; target: number; theme: any }) {
  const c = theme.colors;
  const hot = streak >= 3;
  return (
    <View style={[st.streakRow, { backgroundColor: c.surface, borderColor: c.border, borderRadius: theme.borderRadius.l }]}>
      <View style={st.streakLeft}>
        <Ionicons name="flame" size={19} color={hot ? '#FB923C' : c.text.light} />
        <Text style={[st.streakNum, { color: hot ? '#FB923C' : c.text.primary }]}>{streak}</Text>
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
    <LinearGradient
      colors={[`${c.deep}F0`, `${c.surface}FF`] as any}
      start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
      style={[st.scoreCard, { borderColor: `${c.primary}28`, borderRadius: theme.borderRadius.xl }]}
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
        style={({ pressed }) => [st.scoreTop, onPressOverall && pressed && { opacity: 0.92 }]}
        accessibilityRole={onPressOverall ? 'button' : undefined}
        accessibilityLabel={onPressOverall ? 'Overall score details' : undefined}
      >
        <View style={st.ringWrap}>
          <Ring score={ringArcScore} primary={c.primary} accent={c.accent} track={`${c.border}80`} />
          <View style={st.ringInner} pointerEvents="none">
            <Text style={[st.scoreNum, { color: c.text.primary }]}>{Math.round(score)}</Text>
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

      {/* Skill chips 2×2 */}
      <View style={st.skillGrid}>
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
      </View>

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
    </LinearGradient>
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
function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function PracticeCallCard({
  title,
  description,
  buttonText,
  onPress,
  theme,
}: {
  title: string;
  description: string;
  buttonText: string;
  onPress: () => void;
  theme: any;
}) {
  const c = theme.colors;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88}>
      <LinearGradient
        colors={[`${c.primary}22`, `${c.surface}FF`] as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[st.practiceCtaCard, { borderColor: `${c.primary}40` }]}
      >
        <View style={st.practiceCtaIcon}>
          <Ionicons name="call" size={22} color={c.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[st.practiceCtaTitle, { color: c.text.primary }]}>{title}</Text>
          <Text style={[st.practiceCtaDesc, { color: c.text.secondary }]}>{description}</Text>
        </View>
        <View style={[st.practiceCtaBtn, { backgroundColor: c.primary }]}>
          <Text style={st.practiceCtaBtnTxt}>{buttonText}</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function sessionHasFeedbackReady(session: ConversationSession): boolean {
  if (session.status !== 'COMPLETED') return false;
  const summaryScore = session.summaryJson?.overall_score;
  if (typeof summaryScore === 'number' && summaryScore > 0) return true;
  return (session.analyses?.length ?? 0) > 0;
}

export default function HomeScreen() {
  const { theme } = useTheme();
  const { user, isLoaded } = useUser();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const socketService = useRef(SocketService.getInstance()).current;

  const [homeData, setHomeData]       = useState<HomeData | null>(null);
  const [phrases, setPhrases]         = useState<Phrase[]>([]);
  const [loadingHome, setLoadingHome] = useState(true);
  const [loadingPhrase, setLoadingPhrase] = useState(true);
  const [phraseIdx, setPhraseIdx]     = useState(0); // kept for type compat, unused
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [skillSheet, setSkillSheet] = useState<SkillSheetStateV1>(null);
  const [feedbackReadySession, setFeedbackReadySession] = useState<ConversationSession | null>(null);

  const c = theme.colors;

  // ── Fetch home data (stale-while-revalidate) ───────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let alive = true;

      const loadHome = async () => {
        try {
          const cached = await AsyncStorage.getItem(HOME_DATA_CACHE_KEY);
          if (cached && alive) {
            setHomeData(JSON.parse(cached) as HomeData);
            setLoadingHome(false);
          } else if (alive) {
            setLoadingHome(true);
          }
        } catch {
          if (alive) setLoadingHome(true);
        }

        try {
          const fresh = await getHomeData();
          if (!alive) return;
          setHomeData(fresh);
          await AsyncStorage.setItem(HOME_DATA_CACHE_KEY, JSON.stringify(fresh));
        } catch (e) {
          console.warn('[HomeV1] home data:', e);
        } finally {
          if (alive) setLoadingHome(false);
        }

        try {
          const sessions = await sessionsApi.listSessions();
          if (!alive) return;
          const sorted = [...sessions]
            .filter(sessionHasFeedbackReady)
            .sort((a, b) => {
              const ta = new Date(a.endedAt ?? a.startedAt).getTime();
              const tb = new Date(b.endedAt ?? b.startedAt).getTime();
              return tb - ta;
            });
          for (const session of sorted) {
            const seen = await AsyncStorage.getItem(feedbackSeenKey(session.id));
            if (!seen) {
              setFeedbackReadySession(session);
              return;
            }
          }
          setFeedbackReadySession(null);
        } catch (e) {
          console.warn('[HomeV1] feedback-ready scan:', e);
          if (alive) setFeedbackReadySession(null);
        }
      };

      void loadHome();
      return () => {
        alive = false;
      };
    }, []),
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

  // ── Fetch phrase ───────────────────────────────────────────────────────────
  useEffect(() => {
    // Use local deterministic phrase source to avoid backend 404 noise.
    const p = getPhraseOfTheDay();
    setPhrases([
      {
        id: 'local-pod',
        phrase: p.phrase,
        definition: p.meaning,
        example: p.usage,
      },
    ]);
    setLoadingPhrase(false);
  }, []);

  // ── Derived values ─────────────────────────────────────────────────────────
  const scoreRaw  = homeData?.header.score;
  const score     = Number(scoreRaw ?? 0);
  const level     = (homeData?.header.level ?? '').trim();
  const goalTgt   = homeData?.header.goalTarget ?? 100;
  const goalLabel = homeData?.header.goalLabel ?? (level ? nextCefr(level) : 'Next Level');
  const streak    = homeData?.header.streak ?? 0;
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
    hasSkillScores;
  const levelForUi   = level || '—';
  const initials     = `${user?.firstName?.charAt(0) ?? ''}${user?.lastName?.charAt(0) ?? ''}`.toUpperCase() || '?';

  // ── Handlers ───────────────────────────────────────────────────────────────
  const goResults  = () => latestId ? navigation.navigate('AssessmentResult', { sessionId: latestId }) : navigation.navigate('AssessmentIntro');
  const goRetake   = () => navigation.navigate('AssessmentIntro');
  const goAssess   = () => navigation.navigate('AssessmentIntro');
  const goChat     = () => navigation.navigate('Conversations');
  const goNotifs   = () => navigation.navigate('Notifications');
  const goPracticeCall = () => navigation.navigate('CallPreference');
  const goFeedbackReady = async () => {
    if (!feedbackReadySession) return;
    await AsyncStorage.setItem(feedbackSeenKey(feedbackReadySession.id), '1');
    setFeedbackReadySession(null);
    navigation.navigate('CallFeedback', { sessionId: feedbackReadySession.id });
  };

  const practiceCta = resolvePracticeCta(homeData?.primaryCTA);
  const practiceTitle = practiceCta.title;
  const practiceDescription = practiceCta.description;
  const practiceButton = practiceCta.buttonText;

  const feedbackOverall =
    feedbackReadySession?.summaryJson?.overall_score ??
    (feedbackReadySession?.analyses?.[0]?.scores as { overall?: number } | undefined)?.overall;

  return (
    <View style={[st.root, { backgroundColor: c.background }]}>
      <StatusBar style="light" backgroundColor={c.background} />

      <ScrollView
        style={[st.scroll, { backgroundColor: c.background }]}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 104, paddingHorizontal: HPAD, gap: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(0).duration(340).springify()} style={st.header}>
          {isLoaded
            ? <Avatar url={user?.imageUrl} initials={initials} primary={c.primary} />
            : <View style={[st.avatar, { borderColor: `${c.primary}28`, backgroundColor: `${c.primary}15` }]} />
          }
          <View style={st.switcher}>
            {isLoaded && user?.firstName ? (
              <Text style={{ fontSize: 11, color: c.text.light, fontWeight: '600', marginBottom: 2 }} numberOfLines={1}>
                {timeGreeting()}, {user.firstName}
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
        {!loadingHome && (
          <Animated.View entering={FadeInDown.delay(70).duration(340).springify()}>
            <StreakRow streak={streak} done={done} target={target} theme={theme} />
          </Animated.View>
        )}

        {/* ── Score Card / Nudge ──────────────────────────────────────────── */}
        {loadingHome ? (
          <Animated.View entering={FadeIn.delay(60).duration(260)}>
            <ScoreSkeleton theme={theme} />
          </Animated.View>
        ) : hasData ? (
          <Animated.View entering={FadeInDown.delay(130).duration(400).springify()}>
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
          <Animated.View entering={FadeInDown.delay(130).duration(400).springify()}>
            <AssessmentNudge theme={theme} onPress={goAssess} />
          </Animated.View>
        )}

        {!loadingHome && (
          <Animated.View entering={FadeInDown.delay(180).duration(380).springify()}>
            <PracticeCallCard
              title={practiceTitle}
              description={practiceDescription}
              buttonText={practiceButton}
              onPress={goPracticeCall}
              theme={theme}
            />
          </Animated.View>
        )}

        {!loadingHome && feedbackReadySession && (
          <Animated.View entering={FadeInDown.delay(200).duration(380).springify()}>
            <FeedbackReadyCard
              onPress={() => void goFeedbackReady()}
              timeAgo="Just now"
              overallScore={
                typeof feedbackOverall === 'number' ? Math.round(feedbackOverall) : undefined
              }
            />
          </Animated.View>
        )}

        {/* ── Phrase carousel ─────────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(210).duration(380).springify()} style={{ gap: 10 }}>
          <PulseHomeCarousel phrase={phrases[0] ?? null} loadingPhrase={loadingPhrase} />
        </Animated.View>
      </ScrollView>

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

  practiceCtaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  practiceCtaIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139,92,246,0.14)',
  },
  practiceCtaTitle: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
  practiceCtaDesc: { fontSize: 12, lineHeight: 17 },
  practiceCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  practiceCtaBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Score card
  scoreCard: { borderWidth:1, padding:CPAD, gap:16 },
  scoreTop: { flexDirection:'row', alignItems:'center', gap:16 },
  ringWrap: { width:RING_SIZE, height:RING_SIZE, alignItems:'center', justifyContent:'center' },
  ringInner: { position:'absolute', top:0, left:0, right:0, bottom:0, alignItems:'center', justifyContent:'center' },
  scoreNum: { fontSize:36, fontWeight:'800', lineHeight:42, letterSpacing:-1 },
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
  skillChip: { flexDirection:'row', alignItems:'center', paddingHorizontal:10, paddingVertical:7, borderRadius:8, borderWidth:1, gap:5, flex:1, minWidth:'45%' },
  skillDot: { width:7, height:7, borderRadius:4 },
  skillLabel: { fontSize:11, fontWeight:'600', flex:1 },
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
