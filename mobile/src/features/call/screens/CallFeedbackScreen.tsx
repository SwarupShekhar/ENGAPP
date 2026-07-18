import React, { useState, useEffect, useRef, useCallback } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { useUser } from "@clerk/clerk-expo";
import { fetchFeedbackNarration, fetchFullFeedbackNarration, fetchErrorSpeak } from "../../../api/tts";
import { getOrFetchTtsFileUri, prefetchTtsFileUri } from "../../../utils/ttsAudioCache";
import {
  LatencyTimeline,
  type LatencyTrace,
} from "../../../utils/latencyTimeline";
import type {
  FeedbackNarrationPayload,
  FeedbackSection,
  NarrationError,
  WordTimestamp,
} from "../../../api/tts";
import { PronIssueNormalized, getPronUI, getPronLabel, getPronFix, buildPronCoachingLine } from "../utils/pronUtils";
import { usePulseTTS } from "../hooks/usePulseTTS";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  FadeInRight,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  Easing,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useAppTheme } from "../../../theme/useAppTheme";
import { getLevelColor } from "../../../theme/colorUtils";
import {
  sessionsApi,
  ConversationSession,
  parsePronunciationIssue,
} from "../../../api/sessions";

// Feedback Components
import { WordLevelBreakdown } from "../components/WordLevelBreakdown";
import { PracticeTips } from "../components/PracticeTips";
import { GrammarVocabBreakdown } from "../components/GrammarVocabBreakdown";
import { ScoreBreakdownCard } from "../components/ScoreBreakdownCard";
import { FluencyMetricsSection } from "../../../components/FluencyMetricsSection";
import { DeliveryInsightsCard } from "../../../components/DeliveryInsightsCard";
import type { FluencyBreakdown } from "../../../types/fluency";
import type { DeliveryInsight } from "../../../types/delivery";
import { paceLabel } from "../../../types/fluency";
import { CallQualityScoreCard } from "../components/CallQualityScoreCard";
import { CoachingCallSummaryToast } from "../components/CoachingCallSummaryToast";
import { FeedbackAnalysisChecklist } from "../components/FeedbackAnalysisChecklist";
import { PartnerWaitPanel } from "../components/PartnerWaitPanel";
import { useFeedbackAnalysisProgress } from "../hooks/useFeedbackAnalysisProgress";
import {
  MAX_PRON_POLLS,
  PRON_POLL_INTERVAL_MS,
} from "../utils/feedbackAnalysisSignals";
import { getCQSScore, CQSResults } from "../../../api/scoring";
import { useAnalytics } from "../../../analytics/useAnalytics";
import { AnalyticsEvents } from "../../../analytics/events";
import { analyticsMeta } from "../../../analytics/eventMeta";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const FIRST_CALL_COMPLETED_KEY = "analytics:first_call_completed";

// ─── Step-by-step feedback types ─────────────────────────
type FeedbackPhase = 'intro' | 'step' | 'summary' | 'detail';

type FeedbackStep = {
  id: string;
  category: 'pronunciation' | 'grammar' | 'vocabulary';
  youSaid: string;
  correct: string;
  correctionLabel: string;
  ttsText: string;
};

/** One screen per skill area (max 4: pronunciation, grammar, vocabulary, fluency). */
type FeedbackSegment = {
  id: string;
  category: FeedbackSection;
  youSaid?: string;
  correct?: string;
  correctionLabel: string;
  /** When false, show a single insight card (fluency). */
  hasCorrectionCards: boolean;
  fluencyNote?: string;
};

type CardRevealPhase = 'none' | 'youSaid' | 'both';

const STEP_CATEGORY_COLORS = {
  pronunciation: '#F59E0B',
  grammar: '#10B981',
  vocabulary: '#3B82F6',
} as const;

const STEP_CATEGORY_BG = {
  pronunciation: '#FFFBEB',
  grammar: '#F0FDF4',
  vocabulary: '#EFF6FF',
} as const;

// ─── Segment playback progress ring ──────────────────────────
const SEG_RING_SIZE = 84;
const SEG_RING_STROKE = 5;
const SEG_RING_RADIUS = (SEG_RING_SIZE - SEG_RING_STROKE * 2) / 2;
const SEG_RING_CIRC = 2 * Math.PI * SEG_RING_RADIUS;
const AnimatedSegCircle = Animated.createAnimatedComponent(Circle);

/**
 * Animated circular progress ring drawn behind the step play/pause button.
 * `progress` is a reanimated shared value in [0,1] driven by audio position.
 */
function SegmentProgressRing({
  progress,
  color,
  track,
}: {
  progress: SharedValue<number>;
  color: string;
  track: string;
}) {
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: SEG_RING_CIRC * (1 - Math.min(1, Math.max(0, progress.value))),
  }));
  return (
    <Svg
      width={SEG_RING_SIZE}
      height={SEG_RING_SIZE}
      style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
    >
      <Circle
        cx={SEG_RING_SIZE / 2}
        cy={SEG_RING_SIZE / 2}
        r={SEG_RING_RADIUS}
        stroke={track}
        strokeWidth={SEG_RING_STROKE}
        fill="none"
      />
      <AnimatedSegCircle
        cx={SEG_RING_SIZE / 2}
        cy={SEG_RING_SIZE / 2}
        r={SEG_RING_RADIUS}
        stroke={color}
        strokeWidth={SEG_RING_STROKE}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={SEG_RING_CIRC}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}

// ─── Skill Bar Component ──────────────────────────────────
function SkillBar({
  label,
  score,
  icon,
  color,
  delay,
}: {
  label: string;
  score: number;
  icon: string;
  color: string;
  delay: number;
}) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const clampedScore = Math.min(100, Math.max(0, score));
  return (
    <Animated.View
      entering={FadeInRight.delay(delay).springify()}
      style={styles.skillRow}
    >
      <View style={styles.skillInfo}>
        <View style={[styles.skillIcon, { backgroundColor: color + "15" }]}>
          <Ionicons name={icon as any} size={16} color={color} />
        </View>
        <Text style={styles.skillLabel}>{label}</Text>
      </View>
      <View style={styles.barContainer}>
        <View
          style={[
            styles.barFill,
            { width: `${clampedScore}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={[styles.skillScore, { color }]}>{clampedScore}%</Text>
    </Animated.View>
  );
}

// ─── Build highlight ranges from transcript + mistakes/pronunciation ─────
type HighlightRange = { start: number; end: number; type: "grammar" | "pronunciation" };

type PronIssueLike = {
  // new pipeline shape
  spoken?: string;
  correct?: string;
  rule_category?: string;
  confidence?: number;
  word_index?: number;
  // legacy DB shape
  word?: string;
  issueType?: string;
  severity?: string;
  suggestion?: string;
};

function _findWordRangeByIndex(text: string, wordIndex: number): { start: number; end: number } | null {
  if (!text || wordIndex == null || Number.isNaN(wordIndex) || wordIndex < 0) return null;
  const re = /\b[\w']+\b/g;
  let i = 0;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text)) !== null) {
    if (i === wordIndex) return { start: m.index, end: m.index + m[0].length };
    i += 1;
  }
  return null;
}

function buildHighlightRanges(
  transcript: string,
  mistakes: { original_text?: string; original?: string }[],
  pronunciationIssues: PronIssueLike[],
): HighlightRange[] {
  if (!transcript) return [];
  const lower = transcript.toLowerCase();
  const ranges: HighlightRange[] = [];

  const grammarPhrases = mistakes
    .map((m) => (m.original_text ?? m.original ?? "").trim())
    .filter((p) => p.length >= 2);
  for (const phrase of grammarPhrases) {
    const phraseLower = phrase.toLowerCase();
    let i = 0;
    while (true) {
      const idx = lower.indexOf(phraseLower, i);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + phrase.length, type: "grammar" });
      i = idx + 1;
    }
  }

  // Prefer word_index-based highlight (most reliable). Fallback to matching the correct word string.
  for (const p of pronunciationIssues) {
    const idx = typeof p.word_index === "number" ? p.word_index : null;
    if (idx != null) {
      const r = _findWordRangeByIndex(transcript, idx);
      if (r) {
        ranges.push({ start: r.start, end: r.end, type: "pronunciation" });
        continue;
      }
    }
    const target = (p.correct ?? p.word ?? "").trim();
    if (target.length < 2) continue;
    const wordLower = target.toLowerCase();
    const wordRegex = new RegExp(
      `\\b${wordLower.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`,
      "gi",
    );
    let match: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((match = wordRegex.exec(transcript)) !== null) {
      ranges.push({
        start: match.index,
        end: match.index + match[0].length,
        type: "pronunciation",
      });
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  const merged: HighlightRange[] = [];
  for (const r of ranges) {
    if (merged.length && r.start < merged[merged.length - 1].end) {
      const last = merged[merged.length - 1];
      last.end = Math.max(last.end, r.end);
      if (r.type === "grammar") last.type = "grammar";
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

// ─── Chat-style transcript with highlights ───────────────
function TranscriptWithHighlights({
  transcript,
  mistakes,
  pronunciationIssues,
  participants,
}: {
  transcript: string;
  mistakes: { original_text?: string; original?: string }[];
  pronunciationIssues?: PronIssueLike[];
  participants?: any[];
}) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const ranges = buildHighlightRanges(transcript, mistakes, pronunciationIssues ?? []);

  const lines = transcript.split("\n").filter((l) => l.trim().length > 0);
  const hasSpeakerLabels = lines.some((l) => /^[^:]+:/.test(l));

  const resolveSpeakerName = (rawSpeaker: string): string => {
    const s = (rawSpeaker || "").trim();
    if (!s) return "User";
    const lower = s.toLowerCase();
    if (lower.includes("maya")) return "Maya";

    const token = lower
      .replace(/^user[_\s:-]*/i, "")
      .replace(/^participant[_\s:-]*/i, "")
      .trim();

    const list = participants || [];
    for (const p of list) {
      const u = (p as any)?.user;
      const fname = (u?.fname || "").trim();
      if (!fname) continue;

      const clerkId = (u?.clerkId || "").toLowerCase();
      const internalUserId = ((p as any)?.userId || "").toLowerCase();
      const internalUserUuid = (u?.id || "").toLowerCase();

      if (token && (token === clerkId || token === internalUserId || token === internalUserUuid)) {
        return fname;
      }
      if (lower === clerkId || lower === internalUserId || lower === internalUserUuid) {
        return fname;
      }
    }
    // fallback: show a friendlier label than "user_8349..."
    return s.replace(/^user[_\s:-]*/i, "User ");
  };

  if (!hasSpeakerLabels) {
    return renderHighlightedText(transcript, ranges, styles, theme);
  }

  return (
    <View style={{ gap: 8 }}>
      {lines.map((line, li) => {
        const colonIdx = line.indexOf(":");
        if (colonIdx === -1 || colonIdx > 40) {
          return (
            <Text key={li} style={styles.transcriptText}>
              {line}
            </Text>
          );
        }
        const speaker = line.slice(0, colonIdx).trim();
        const displaySpeaker = resolveSpeakerName(speaker);
        const message = line.slice(colonIdx + 1).trim();
        const isFirstSpeaker = lines.findIndex((l) => l.startsWith(speaker)) === li ||
          lines.filter((l) => l.startsWith(speaker + ":")).length > 0;
        const speakerColor = speaker === lines[0]?.split(":")[0]?.trim()
          ? theme.colors.primary
          : theme.colors.success;

        return (
          <View key={li} style={styles.chatBubbleWrap}>
            <Text style={[styles.chatSpeaker, { color: speakerColor }]}>
              {displaySpeaker}
            </Text>
            <View style={[styles.chatBubble, { borderLeftColor: speakerColor }]}>
              {renderHighlightedText(message, ranges, styles, theme, getLineOffset(transcript, line, colonIdx + 1))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function PronunciationTabs({
  issues,
  transcript,
  onPractice,
  firstName,
  enteringDelay = 400,
  embedded = false,
}: {
  issues: PronIssueNormalized[];
  transcript: string;
  onPractice: (ruleCategory: string, reelId?: string) => void;
  firstName?: string;
  enteringDelay?: number;
  /** When true, parent section supplies the heading (detail phase). */
  embedded?: boolean;
}) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const [tab, setTab] = useState<"issues" | "transcript" | "patterns">("issues");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalIssue, setModalIssue] = useState<PronIssueNormalized | null>(null);
  const { playingId, play, stop } = usePulseTTS();

  const countsByCat: Record<string, number> = {};
  for (const i of issues) {
    const k = i.rule_category || "other";
    countsByCat[k] = (countsByCat[k] || 0) + 1;
  }
  const groups = Object.entries(countsByCat)
    .map(([rule_category, count]) => ({ rule_category, count }))
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...groups.map((g) => g.count));

  const issueByIndex = new Map<number, PronIssueNormalized>();
  issues.forEach((i) => {
    if (typeof i.word_index === "number") issueByIndex.set(i.word_index, i);
  });

  const TabPill = ({
    id,
    label,
  }: {
    id: "issues" | "transcript" | "patterns";
    label: string;
  }) => {
    const active = tab === id;
    return (
      <TouchableOpacity
        onPress={() => setTab(id)}
        activeOpacity={0.8}
        style={[
          styles.pronTabPill,
          active ? styles.pronTabPillActive : styles.pronTabPillInactive,
        ]}
      >
        <Text style={[styles.pronTabText, active ? styles.pronTabTextActive : styles.pronTabTextInactive]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const IssueCard = ({ item }: { item: PronIssueNormalized }) => {
    const expanded = expandedId === item.id;
    const ui = getPronUI(item.rule_category);
    const label = getPronLabel(item.rule_category);
    const acc = item.confidence != null ? Math.round(item.confidence) : null;
    return (
      <View style={styles.pronIssueCard}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setExpandedId(expanded ? null : item.id)}
          style={styles.pronIssueTop}
        >
          <View style={[styles.pronIssueAvatar, { backgroundColor: ui.bg, borderColor: ui.text + "55" }]}>
            <Text style={[styles.pronIssueAvatarText, { color: ui.text }]}>{ui.key}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pronIssueWordRow} numberOfLines={2}>
              <Text style={styles.pronIssueCorrect}>{item.correct}</Text>
              {item.spoken && item.spoken !== "—" ? (
                <>
                  <Text style={styles.pronIssueArrow}>{"  →  "}</Text>
                  <Text style={[styles.pronIssueSpoken, { color: ui.text }]}>{item.spoken}</Text>
                </>
              ) : null}
            </Text>
            <Text style={styles.pronIssueMeta}>
              {label}
              {acc != null ? ` • ${acc}%` : ""}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              if (playingId === item.id) { stop(); return; }
              if (playingId) stop();
              play(item, firstName);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={playingId === item.id ? "stop-circle" : "volume-high-outline"}
              size={20}
              color={ui.text}
            />
          </TouchableOpacity>
          <Ionicons
            name="chevron-down"
            size={18}
            color={theme.colors.text.secondary}
            style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}
          />
        </TouchableOpacity>

        {expanded && (
          <View style={styles.pronIssueExpanded}>
            <Text style={styles.pronIssueFix}>{getPronFix(item.rule_category)}</Text>

            {/* eBites recommendation card — show when we have a direct reel or a known error category */}
            {(item.reel_id || (item.rule_category && item.rule_category !== "general_mispronunciation")) && (
              <TouchableOpacity
                style={styles.ebitesRecommendCard}
                activeOpacity={0.85}
                onPress={() => onPractice(item.rule_category, item.reel_id)}
              >
                <View style={styles.ebitesRecommendIcon}>
                  <Ionicons name="play-circle" size={22} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ebitesRecommendTitle}>Watch to fix this sound</Text>
                  <Text style={styles.ebitesRecommendSub}>
                    eBites has short videos targeting your {getPronLabel(item.rule_category)} error
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#7C3AED" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.pronPracticeBtn, { backgroundColor: ui.text }]}
              activeOpacity={0.85}
              onPress={() => onPractice(item.rule_category, item.reel_id)}
            >
              <Text style={styles.pronPracticeBtnText}>Practice this sound</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderTranscriptTab = () => {
    const text = (transcript || "").trim();
    if (!text) return <Text style={styles.emptyTabText}>No transcript available.</Text>;

    const parts = text.split(/(\s+)/);
    let wordIdx = 0;
    return (
      <Text style={styles.pronTranscriptText}>
        {parts.map((p, i) => {
          if (!p) return null;
          if (/^\s+$/.test(p)) return p;
          const clean = p.replace(/[^\w']/g, "");
          const idxMatch = issueByIndex.get(wordIdx);
          const fallbackMatch =
            !idxMatch &&
            issues.find((iss) => iss.correct.toLowerCase() === clean.toLowerCase());
          const match = idxMatch || fallbackMatch || null;
          const currentWordIdx = wordIdx;
          wordIdx += 1;
          if (!match) return p;
          const ui = getPronUI(match.rule_category);
          return (
            <Text
              key={`${i}-${currentWordIdx}`}
              onPress={() => setModalIssue(match)}
              style={[styles.pronChip, { backgroundColor: ui.bg, borderColor: ui.text + "55", color: ui.text }]}
            >
              {p}
            </Text>
          );
        })}
        {"\n\n"}
        <Text style={styles.pronLegend}>
          <Text style={[styles.pronLegendDot, { color: "#f59e0b" }]}>●</Text> mispronounced
        </Text>
      </Text>
    );
  };

  const renderPatternsTab = () => {
    if (!groups.length) return <Text style={styles.emptyTabText}>No patterns yet.</Text>;
    return (
      <View style={{ gap: 10 }}>
        {groups.map((g) => {
          const ui = getPronUI(g.rule_category);
          const sev = g.count >= 3 ? "High" : g.count === 2 ? "Medium" : "Low";
          const sevColor = g.count >= 3 ? "#ef4444" : g.count === 2 ? "#f59e0b" : "#7c3aed";
          return (
            <View key={g.rule_category} style={styles.pronPatternRow}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.pronPatternTitle}>
                  {getPronLabel(g.rule_category)} <Text style={styles.pronPatternCount}>({g.count})</Text>
                </Text>
                <View style={[styles.pronSeverityPill, { backgroundColor: sevColor + "18" }]}>
                  <Text style={[styles.pronSeverityText, { color: sevColor }]}>{sev}</Text>
                </View>
              </View>
              <View style={styles.pronPatternBarBg}>
                <View
                  style={[
                    styles.pronPatternBarFill,
                    {
                      width: `${Math.max(8, (g.count / maxCount) * 100)}%`,
                      backgroundColor: ui.text,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
        <TouchableOpacity
          style={[styles.pronPlanBtn, { backgroundColor: theme.colors.primary }]}
          activeOpacity={0.85}
          onPress={() => onPractice("all")}
        >
          <Text style={styles.pronPlanBtnText}>Build my practice plan</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Animated.View entering={FadeInDown.delay(enteringDelay).springify()}>
      {!embedded ? <Text style={styles.sectionTitle}>Pronunciation</Text> : null}
      <View style={styles.pronTabsBar}>
        <TabPill id="issues" label={`Issues (${issues.length})`} />
        <TabPill id="transcript" label="Transcript" />
        <TabPill id="patterns" label="Patterns" />
      </View>

      <View style={styles.pronTabsBody}>
        {tab === "issues" && (
          <View style={{ gap: 10 }}>
            {issues.map((it) => (
              <IssueCard key={it.id} item={it} />
            ))}
          </View>
        )}
        {tab === "transcript" && <View style={styles.pronTranscriptWrap}>{renderTranscriptTab()}</View>}
        {tab === "patterns" && renderPatternsTab()}
      </View>

      <Modal transparent visible={!!modalIssue} animationType="fade" onRequestClose={() => setModalIssue(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setModalIssue(null)}>
          <Pressable style={styles.modalCard} onPress={() => null}>
            {modalIssue && (
              <>
                <Text style={styles.modalTitle}>{modalIssue.correct}</Text>
                <Text style={styles.modalSub}>
                  You said: <Text style={{ fontWeight: "700" }}>{modalIssue.spoken}</Text>
                </Text>
                <Text style={styles.modalFix}>{getPronFix(modalIssue.rule_category)}</Text>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: theme.colors.primary }]}
                  activeOpacity={0.85}
                  onPress={() => onPractice(modalIssue.rule_category)}
                >
                  <Text style={styles.modalBtnText}>Practice this sound</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}

function getLineOffset(fullText: string, line: string, extraOffset: number): number {
  const idx = fullText.indexOf(line);
  return idx === -1 ? 0 : idx + extraOffset;
}

function renderHighlightedText(
  text: string,
  allRanges: HighlightRange[],
  styles: any,
  theme: any,
  textOffset = 0,
): React.ReactElement {
  const relevantRanges = allRanges
    .filter((r) => r.end > textOffset && r.start < textOffset + text.length)
    .map((r) => ({
      ...r,
      start: Math.max(0, r.start - textOffset),
      end: Math.min(text.length, r.end - textOffset),
    }));

  if (relevantRanges.length === 0) {
    return (
      <Text style={styles.transcriptText} selectable>
        {text}
      </Text>
    );
  }

  const segments: { text: string; type: "grammar" | "pronunciation" | null }[] = [];
  let pos = 0;
  for (const r of relevantRanges) {
    if (r.start > pos) segments.push({ text: text.slice(pos, r.start), type: null });
    segments.push({ text: text.slice(r.start, r.end), type: r.type });
    pos = r.end;
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), type: null });

  return (
    <Text style={styles.transcriptText} selectable>
      {segments.map((seg, i) => {
        if (!seg.type) return seg.text;
        const hlStyle = seg.type === "grammar" ? styles.transcriptHighlight : styles.transcriptPronunciationHighlight;
        return (
          <Text key={i} style={[styles.transcriptText, hlStyle]}>
            {seg.text}
          </Text>
        );
      })}
    </Text>
  );
}

// ─── Severity Badge ───────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const colors: Record<string, { bg: string; text: string }> = {
    critical: { bg: theme.colors.error + "15", text: theme.colors.error },
    major: { bg: theme.colors.warning + "15", text: theme.colors.warning },
    high: { bg: theme.colors.error + "15", text: theme.colors.error },
    medium: { bg: theme.colors.warning + "15", text: theme.colors.warning },
    minor: { bg: theme.colors.success + "15", text: theme.colors.success },
    low: { bg: theme.colors.success + "15", text: theme.colors.success },
    suggestion: { bg: theme.colors.primary + "15", text: theme.colors.primary },
  };
  const c = colors[severity?.toLowerCase()] || colors.medium;
  return (
    <View style={[styles.severityBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.severityText, { color: c.text }]}>
        {severity?.charAt(0).toUpperCase() + severity?.slice(1) || "Medium"}
      </Text>
    </View>
  );
}

// ─── Mistake Card ─────────────────────────────────────────
function MistakeCard({ item, index }: { item: any; index: number }) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const [expanded, setExpanded] = useState(true);
  const orig = item.original_text ?? item.original ?? "";
  const corr = item.corrected_text ?? item.corrected ?? "";
  const expl = item.explanation ?? "";
  const example = item.example ?? "";
  return (
    <Animated.View entering={FadeInDown.delay(600 + index * 100).springify()}>
      <TouchableOpacity
        style={styles.mistakeCard}
        activeOpacity={0.8}
        onPress={() => setExpanded(!expanded)}
      >
        <View style={styles.mistakeHeader}>
          <View style={styles.mistakeTypeRow}>
            <View style={styles.mistakeTypePill}>
              <Text style={styles.mistakeTypeText}>
                {item.rule || item.type}
              </Text>
            </View>
            <SeverityBadge severity={item.severity} />
          </View>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={theme.colors.text.secondary}
          />
        </View>

        <View style={styles.mistakeContent}>
          {orig ? (
            <View style={styles.mistakeLine}>
              <Text style={styles.mistakeLabel}>What you said</Text>
              <View style={styles.mistakeLineInner}>
                <View
                  style={[
                    styles.mistakeDot,
                    { backgroundColor: theme.colors.error },
                  ]}
                />
                <Text style={styles.originalText}>{orig}</Text>
              </View>
            </View>
          ) : null}
          {corr ? (
            <View style={styles.mistakeLine}>
              <Text style={styles.mistakeLabel}>Better way</Text>
              <View style={styles.mistakeLineInner}>
                <View
                  style={[
                    styles.mistakeDot,
                    { backgroundColor: theme.colors.success },
                  ]}
                />
                <Text style={styles.correctedText}>{corr}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {expanded && expl ? (
          <View style={styles.explanationContainer}>
            <Ionicons
              name="bulb-outline"
              size={16}
              color={theme.colors.primary}
            />
            <Text style={styles.explanationText}>{expl}</Text>
          </View>
        ) : null}
        {expanded && example ? (
          <View style={styles.exampleContainer}>
            <Ionicons
              name="chatbox-ellipses-outline"
              size={14}
              color={theme.colors.primary}
            />
            <Text style={styles.exampleLabel}>Example of correct usage</Text>
            <Text style={styles.exampleText}>{example}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Score Color Helper ───────────────────────────────────
function getScoreColor(score: number, theme: any) {
  if (score >= 80) return theme.colors.success;
  if (score >= 60) return theme.colors.warning;
  if (score >= 40) return theme.colors.warning;
  return theme.colors.error;
}

// ─── Main Component ───────────────────────────────────────
export default function CallFeedbackScreen({ navigation, route }: any) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const { user } = useUser();
  const analytics = useAnalytics();
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState<ConversationSession | null>(
    null,
  );
  const [retryCount, setRetryCount] = useState(0);
  const [errorHeader, setErrorHeader] = useState(
    "AI is analyzing your call...",
  );
  const [errorDetail, setErrorDetail] = useState(
    "We're preparing your personalized feedback and corrections.",
  );
  const [isFailed, setIsFailed] = useState(false);
  const [checkingAgain, setCheckingAgain] = useState(false);
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(true);
  const [cqsData, setCqsData] = useState<CQSResults | null>(null);
  const [pronPollCount, setPronPollCount] = useState(0);
  const insets = useSafeAreaInsets();

  const loadingProgress = useFeedbackAnalysisProgress({
    sessionData,
    cqsData,
    retryCount,
    loading,
    aboutToExitLoading: false,
  });
  const [playingSection, setPlayingSection] = useState<string | null>(null);
  const [loadingSection, setLoadingSection] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Full feedback audio state
  const [isPlayingFullFeedback, setIsPlayingFullFeedback] = useState(false);
  const [isLoadingFullFeedback, setIsLoadingFullFeedback] = useState(false);
  const fullFeedbackSoundRef = useRef<Audio.Sound | null>(null);
  const [ttsSubtitle, setTtsSubtitle] = useState<string | null>(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [wordTimestamps, setWordTimestamps] = useState<WordTimestamp[]>([]);
  const [currentWordIdx, setCurrentWordIdx] = useState<number>(-1);
  const subtitlePollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step-by-step feedback phase state
  const [feedbackPhase, setFeedbackPhase] = useState<FeedbackPhase>('intro');
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [stepAudioPlaying, setStepAudioPlaying] = useState(false);
  const [stepAudioLoading, setStepAudioLoading] = useState(false);
  const stepSoundRef = useRef<Audio.Sound | null>(null);
  const [cardReveal, setCardReveal] = useState<CardRevealPhase>('none');
  const introAudioStartedRef = useRef(false);
  // Synchronous guard: blocks re-entrant intro play taps (double-tap → 2 fetches).
  const introPlayInFlightRef = useRef(false);
  // Monotonic token identifying the currently-attached segment playback.
  // Stale playback-status handlers compare against this before writing the ring.
  const segmentSeqRef = useRef(0);
  const feedbackTimelineRef = useRef(new LatencyTimeline());
  const [feedbackLatencyTrace, setFeedbackLatencyTrace] = useState<LatencyTrace | null>(
    null,
  );
  const feedbackRenderedTrackedRef = useRef(false);

  // Reanimated: progress of the current segment's audio (0→1) for the ring,
  // and the translateY of the bottom-sheet card that rises on play.
  const segmentProgress = useSharedValue(0);
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  // Single source of truth for the bottom-sheet position: the card rises into
  // place whenever we enter the 'step' phase, and resets off-screen otherwise.
  useEffect(() => {
    if (feedbackPhase === 'step') {
      sheetTranslateY.value = withTiming(0, {
        duration: 460,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      sheetTranslateY.value = SCREEN_HEIGHT;
    }
  }, [feedbackPhase, sheetTranslateY]);

  useEffect(() => {
    if (!sessionData || feedbackRenderedTrackedRef.current) return;
    feedbackRenderedTrackedRef.current = true;
    analytics.capture(
      AnalyticsEvents.FEEDBACK_RENDERED,
      analyticsMeta({
        session_id: sessionData.id,
        has_transcript: Boolean(sessionData.feedback?.transcript),
      }),
    );

    const maybeTrackFirstCallCompleted = async () => {
      try {
        const alreadyTracked = await AsyncStorage.getItem(FIRST_CALL_COMPLETED_KEY);
        if (alreadyTracked === "1") return;
        analytics.capture(
          AnalyticsEvents.FIRST_CALL_COMPLETED,
          analyticsMeta({
            session_id: sessionData.id,
            duration_sec: Number((sessionData as any)?.durationSec ?? 0),
            partner_type: (sessionData as any)?.isAi ? "ai_tutor" : "human",
          }),
        );
        await AsyncStorage.setItem(FIRST_CALL_COMPLETED_KEY, "1");
      } catch (err) {
        if (__DEV__) console.warn("[Analytics] first_call_completed track failed:", err);
      }
    };

    void maybeTrackFirstCallCompleted();
  }, [analytics, sessionData]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      fullFeedbackSoundRef.current?.unloadAsync().catch(() => {});
      stepSoundRef.current?.unloadAsync().catch(() => {});
      if (subtitlePollerRef.current) clearInterval(subtitlePollerRef.current);
    };
  }, []);

  const params = route?.params || {};
  const sessionId = params.sessionId;
  const partnerName = params.partnerName || "Co-learner";
  const topic = params.topic || "General Practice";
  const callDuration = params.duration || 0;
  const [coachingSummaryMessage, setCoachingSummaryMessage] = useState<string | null>(
    params.coachingSummaryMessage ?? null,
  );
  const coachingSummaryPhrases: string[] = params.coachingSummaryPhrases ?? [];

  useEffect(() => {
    let isMounted = true;
    const fetchAnalysis = async () => {
      if (retryCount === 0) {
        feedbackTimelineRef.current.start("feedback_load", `fb_${sessionId}`);
      }
      feedbackTimelineRef.current.markInstant("analysis_poll", {
        attempt: retryCount,
      });

      if (!sessionId || sessionId === "session-id") {
        console.warn(
          "[CallFeedback] Invalid or placeholder sessionId provided",
        );
        setLoading(false);
        return;
      }

      try {
        const data = await sessionsApi.getSessionAnalysis(sessionId);

        // Point 1: Handle different session statuses
        if (data.status === "PROCESSING") {
          // Scores may already be written (CQS) while status lags — show them.
          const analysis = data.analyses?.[0];
          const scores = (analysis?.scores ?? {}) as Record<string, unknown>;
          const overall = Number(scores.overall_score ?? scores.overall ?? 0);
          const hasRealScores =
            scores.source === "cqs" ||
            (overall > 0 && !(overall >= 48 && overall <= 52));
          if (hasRealScores && data.analyses && data.analyses.length > 0) {
            if (isMounted) {
              feedbackTimelineRef.current.markInstant("analysis_ready");
              setSessionData(data);
              setLoading(false);
              feedbackTimelineRef.current.finish({ status: data.status });
              setFeedbackLatencyTrace(feedbackTimelineRef.current.getSnapshot());
              void getCQSScore(sessionId)
                .then((cqs) => {
                  if (isMounted) setCqsData(cqs);
                })
                .catch((err) => console.warn("[CallFeedback] CQS fetch:", err));
            }
            return;
          }

          // Keep session payload so partner-wait / checklist can read real fields
          if (isMounted) {
            setSessionData(data);
          }
          const participantCount = data.participants?.length ?? 0;
          const feedbackCount = data.feedbacks?.length ?? 0;
          const waitingForPartner = participantCount > 0 && feedbackCount < participantCount;
          setErrorHeader(
            waitingForPartner ? "Waiting for your partner" : "Almost there...",
          );
          setErrorDetail(
            waitingForPartner
              ? "Ask your partner to end the call so we can analyze the conversation."
              : "The AI is finalizing your speech metrics.",
          );
          // Poll up to ~2 min (was 12 → stuck at 54% forever)
          if (isMounted && retryCount < 40) {
            setTimeout(() => {
              if (isMounted) setRetryCount((prev) => prev + 1);
            }, 3000);
          } else if (isMounted) {
            setIsFailed(true);
            setLoading(false);
            setErrorHeader("Taking longer than usual");
            setErrorDetail("Tap Check again — your scores may already be ready.");
          }
          return;
        } else if (data.status === "ANALYSIS_FAILED") {
          setErrorHeader("Analysis Failed");
          setErrorDetail(
            "We couldn't process the audio analysis. Showing text-only feedback if available.",
          );
          setIsFailed(true);
          setLoading(false);
          setSessionData(data);
          return;
        }

        if (data.analyses && data.analyses.length > 0) {
          if (isMounted) {
            feedbackTimelineRef.current.markInstant("analysis_ready");
            setSessionData(data);
            setLoading(false);
            feedbackTimelineRef.current.finish({ status: data.status });
            setFeedbackLatencyTrace(feedbackTimelineRef.current.getSnapshot());
            // CQS in parallel — do not block first paint
            void getCQSScore(sessionId)
              .then((cqs) => {
                if (isMounted) setCqsData(cqs);
              })
              .catch((err) => console.warn('[CallFeedback] CQS fetch:', err));
          }
        } else if (retryCount < 20) {
          // ~60s total at 3s per poll — keep partial session for checklist
          if (isMounted) {
            setSessionData(data);
          }
          if (retryCount === 5) {
            setErrorHeader("Still working...");
            setErrorDetail(
              "This session had a lot of great conversation! It's taking a bit longer to analyze.",
            );
          }
          setTimeout(() => {
            if (isMounted) setRetryCount((prev) => prev + 1);
          }, 3000);
        } else {
          // Point 7: Final fallback
          if (isMounted) {
            setIsFailed(true);
            setLoading(false);
            setSessionData(data);
          }
        }
      } catch (error) {
        console.error("Failed to fetch session analysis:", error);
        if (isMounted) {
          setErrorHeader("Couldn't load feedback");
          setErrorDetail(
            "The request failed. Tap Check again to retry or go back home.",
          );
          setIsFailed(true);
          setLoading(false);
        }
      }
    };

    fetchAnalysis();
    return () => {
      isMounted = false;
    };
  }, [sessionId, retryCount]);

  // Background re-fetch: pronunciation issues arrive after the main analysis
  // (LiveKit egress → transcribe → PA is async and slower). Spec §8.2: 8 * 5s.
  useEffect(() => {
    if (loading || !sessionData || !sessionId) return;
    const hasPronIssues =
      (sessionData.analyses?.[0]?.pronunciationIssues?.length ?? 0) > 0;
    if (hasPronIssues || pronPollCount >= MAX_PRON_POLLS) return;

    const timer = setTimeout(async () => {
      try {
        const fresh = await sessionsApi.getSessionAnalysis(sessionId);
        if (fresh.analyses && fresh.analyses.length > 0) {
          setSessionData(fresh);
        }
      } catch {
        // silent — main data is already showing
      }
      setPronPollCount((c) => c + 1);
    }, PRON_POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [loading, sessionData, sessionId, pronPollCount]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const startWordTracking = (sound: Audio.Sound, timestamps: WordTimestamp[]) => {
    if (!timestamps.length) return;
    setWordTimestamps(timestamps);
    subtitlePollerRef.current = setInterval(async () => {
      const status = await sound.getStatusAsync().catch(() => null);
      if (!status || !status.isLoaded) return;
      const posMs = status.positionMillis;
      let idx = -1;
      for (let i = timestamps.length - 1; i >= 0; i--) {
        if (timestamps[i].startMs <= posMs) { idx = i; break; }
      }
      setCurrentWordIdx(idx);
    }, 80);
  };

  const stopWordTracking = () => {
    if (subtitlePollerRef.current) {
      clearInterval(subtitlePollerRef.current);
      subtitlePollerRef.current = null;
    }
    setCurrentWordIdx(-1);
    setWordTimestamps([]);
  };

  // handlePlay must be declared before any early returns to satisfy Rules of Hooks.
  // It reads from sessionData (state) directly so it's safe to call from any render path.
  const handlePlay = useCallback(
    async (section: string) => {
      // Tap same section again → stop
      if (playingSection === section) {
        await soundRef.current?.stopAsync().catch(() => {});
        await soundRef.current?.unloadAsync().catch(() => {});
        soundRef.current = null;
        setPlayingSection(null);
        return;
      }

      // Stop whatever is currently playing
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
        setPlayingSection(null);
      }

      setLoadingSection(section);

      try {
        const currentAnalysis = sessionData?.analyses?.[0];
        const rawData = currentAnalysis?.rawData;
        const summary = sessionData?.summaryJson;
        const aiFeedback = (rawData as any)?.ai_detailed_feedback || null;
        const scores = currentAnalysis?.scores as Record<string, number> | undefined;

        const pronErrors = (currentAnalysis?.pronunciationIssues ?? []).slice(0, 2).map((p: any) => ({
          spoken: p.spoken ?? p.word,
          correct: p.correct ?? p.word,
          rule_category: p.rule_category ?? p.issueType,
        }));

        const grammarErrors = (currentAnalysis?.mistakes ?? []).slice(0, 2).map((m: any) => ({
          original_text: m.original_text ?? m.original,
          corrected_text: m.corrected_text ?? m.corrected,
        }));

        const sectionErrors: Record<string, any[]> = {
          pronunciation: pronErrors,
          grammar: grammarErrors,
          vocabulary: [],
          fluency: [],
        };

        const sectionJustifications: Record<string, string | undefined> = {
          pronunciation: aiFeedback?.pronunciation?.justification,
          grammar: aiFeedback?.grammar?.justification,
          vocabulary: aiFeedback?.vocabulary?.justification,
          fluency: aiFeedback?.fluency?.justification,
        };

        const sectionScores: Record<string, number> = {
          pronunciation: Math.min(100, summary?.pronunciation_score ?? scores?.pronunciation ?? (scores as any)?.pronunciation_score ?? 0),
          grammar: Math.min(100, summary?.grammar_score ?? scores?.grammar ?? (scores as any)?.grammar_score ?? 0),
          vocabulary: Math.min(100, summary?.vocabulary_score ?? scores?.vocabulary ?? (scores as any)?.vocabulary_score ?? 0),
          fluency: Math.min(100, summary?.fluency_score ?? scores?.fluency ?? (scores as any)?.fluency_score ?? 0),
        };

        const result = await fetchFeedbackNarration({
          section: section as FeedbackSection,
          score: sectionScores[section] ?? 0,
          justification: sectionJustifications[section],
          errors: sectionErrors[section],
          first_name: user?.firstName ?? undefined,
        });

        if (!result.audio_base64) {
          console.warn("[FeedbackAudio] TTS returned empty audio for section:", section);
          setLoadingSection(null);
          return;
        }

        // Write base64 MP3 to temp file
        const tmpUri = `${FileSystem.cacheDirectory}feedback_${section}_${Date.now()}.mp3`;
        await FileSystem.writeAsStringAsync(tmpUri, result.audio_base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // Configure audio session and play
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: tmpUri },
          { shouldPlay: true },
        );
        soundRef.current = sound;
        setLoadingSection(null);
        setPlayingSection(section);

        // Auto-reset state when playback finishes
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            soundRef.current = null;
            setPlayingSection(null);
          }
        });
      } catch (err) {
        console.error("[FeedbackAudio] Error:", err);
        setLoadingSection(null);
        setPlayingSection(null);
      }
    },
    [sessionData, playingSection],
  );

  // ── "Listen to Feedback" — plays all mistakes sequentially as one audio ──
  const handlePlayFullFeedback = useCallback(async () => {
    // Toggle off if already playing
    if (isPlayingFullFeedback) {
      await fullFeedbackSoundRef.current?.stopAsync().catch(() => {});
      await fullFeedbackSoundRef.current?.unloadAsync().catch(() => {});
      fullFeedbackSoundRef.current = null;
      setIsPlayingFullFeedback(false);
      setTtsSubtitle(null);
      stopWordTracking();
      return;
    }

    // Stop any section audio still playing
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
      setPlayingSection(null);
    }

    setIsLoadingFullFeedback(true);

    try {
      const currentAnalysis = sessionData?.analyses?.[0];
      const rawData = currentAnalysis?.rawData;
      const summary = sessionData?.summaryJson;
      const aiFeedback = (rawData as any)?.ai_detailed_feedback || null;
      const scores = currentAnalysis?.scores as Record<string, number> | undefined;

      const pronunciationIssues = (currentAnalysis?.pronunciationIssues ?? []).map((p: any) => ({
        spoken: p.spoken ?? p.word,
        correct: p.correct ?? p.word,
        rule_category: p.rule_category ?? p.issueType,
      }));

      const grammarMistakes = (currentAnalysis?.mistakes ?? []).map((m: any) => ({
        original_text: m.original_text ?? m.original,
        corrected_text: m.corrected_text ?? m.corrected,
      }));

      const result = await fetchFullFeedbackNarration({
        pronunciation_issues: pronunciationIssues,
        grammar_mistakes: grammarMistakes,
        scores: {
          pronunciation: Math.min(100, summary?.pronunciation_score ?? scores?.pronunciation ?? 0),
          grammar: Math.min(100, summary?.grammar_score ?? scores?.grammar ?? 0),
          vocabulary: Math.min(100, summary?.vocabulary_score ?? scores?.vocabulary ?? 0),
          fluency: Math.min(100, summary?.fluency_score ?? scores?.fluency ?? 0),
        },
        justifications: {
          pronunciation: aiFeedback?.pronunciation?.justification,
          grammar: aiFeedback?.grammar?.justification,
          vocabulary: aiFeedback?.vocabulary?.justification,
          fluency: aiFeedback?.fluency?.justification,
        },
        first_name: user?.firstName ?? undefined,
      });

      if (!result.audio_base64) {
        setIsLoadingFullFeedback(false);
        return;
      }

      const tmpUri = `${FileSystem.cacheDirectory}full_feedback_${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(tmpUri, result.audio_base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: tmpUri },
        { shouldPlay: true, rate: 0.9, shouldCorrectPitch: true },
      );
      fullFeedbackSoundRef.current = sound;
      setIsLoadingFullFeedback(false);
      setIsPlayingFullFeedback(true);
      setTtsSubtitle(result.text);
      startWordTracking(sound, result.word_timestamps ?? []);

      sound.setOnPlaybackStatusUpdate((status) => {
        if ((status as any).didJustFinish) {
          sound.unloadAsync().catch(() => {});
          fullFeedbackSoundRef.current = null;
          setIsPlayingFullFeedback(false);
          setTtsSubtitle(null);
          stopWordTracking();
        }
      });
    } catch (err) {
      console.error("[FullFeedbackAudio] Error:", err);
      setIsLoadingFullFeedback(false);
      setIsPlayingFullFeedback(false);
    }
  }, [sessionData, isPlayingFullFeedback]);

  if (loading) {
    const isPartnerWait = loadingProgress.mode === "partner_wait";
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <StatusBar barStyle="dark-content" />
        <View
          style={{
            alignItems: "center",
            gap: 20,
            paddingHorizontal: 28,
            width: "100%",
            maxWidth: 420,
          }}
        >
          {isPartnerWait ? (
            <PartnerWaitPanel
              title={loadingProgress.headerTitle}
              body={loadingProgress.headerSubtitle}
            />
          ) : (
            <>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <FeedbackAnalysisChecklist
                items={loadingProgress.checklistItems}
                headerTitle={loadingProgress.headerTitle}
                headerSubtitle={loadingProgress.headerSubtitle}
                hintText={loadingProgress.hintText}
              />
            </>
          )}

          <TouchableOpacity
            style={{ marginTop: 8 }}
            onPress={() => navigation.navigate("MainTabs")}
            accessibilityRole="button"
            accessibilityLabel="Cancel and go home"
          >
            <Text style={{ color: theme.colors.primary, fontWeight: "600" }}>
              Cancel and Go Home
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleCheckAgain = async () => {
    if (!sessionId || sessionId === "session-id") return;
    setCheckingAgain(true);
    try {
      const isRetryingAfterFailure = isFailed && !!sessionData;
      const data = await sessionsApi.getSessionAnalysis(sessionId, {
        retry: isRetryingAfterFailure,
      });
      if (data.analyses && data.analyses.length > 0) {
        setSessionData(data);
        setIsFailed(false);
        setLoading(false);
      } else if (data.status === "COMPLETED" || data.status === "PROCESSING") {
        setSessionData(data);
        setIsFailed(false);
        if (data.status === "PROCESSING") {
          setErrorHeader("Almost there...");
          setErrorDetail("The AI is still finalizing. Tap Check again in a moment.");
          setLoading(true);
          setRetryCount(0);
        }
      } else {
        setSessionData(data);
      }
    } catch (e) {
      console.warn("[CallFeedback] Check again failed:", e);
    }
    setCheckingAgain(false);
  };

  // Point 7: Handle failure UI (no analyses: ANALYSIS_FAILED, fetch error, or timed out)
  // Prefer poll-path errorHeader/errorDetail so Spec §7.3 timeout copy
  // ("Taking longer than usual") is not overwritten by a generic title.
  const hasTranscript =
    typeof sessionData?.feedback?.transcript === "string" &&
    sessionData.feedback.transcript.trim().length > 0;
  const failureTitle = errorHeader || "Analysis Unavailable";
  const failureMessage =
    errorDetail ||
    "We were unable to generate a full analysis for this call. Tap Check again to retry, or go back home.";

  if (
    isFailed &&
    (!sessionData?.analyses || sessionData.analyses.length === 0)
  ) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.container}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 40,
          }}
        >
          <Ionicons
            name="alert-circle-outline"
            size={64}
            color={theme.colors.error}
          />
          <Text style={{ fontSize: 20, fontWeight: "bold", marginTop: 16 }}>
            {failureTitle}
          </Text>
          <Text
            style={{
              textAlign: "center",
              color: theme.colors.text.secondary,
              marginTop: 12,
            }}
          >
            {failureMessage}
          </Text>
          {hasTranscript && (
            <View
              style={{
                marginTop: 20,
                padding: 12,
                backgroundColor: theme.colors.surface,
                borderRadius: 8,
                maxHeight: 120,
                width: "100%",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.text.secondary,
                  marginBottom: 4,
                }}
              >
                Captured transcript
              </Text>
              <Text
                numberOfLines={6}
                style={{ fontSize: 13, color: theme.colors.text.primary }}
              >
                {sessionData.feedback?.transcript?.trim() || ""}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.primaryAction, { marginTop: 32, width: "100%" }]}
            onPress={handleCheckAgain}
            disabled={checkingAgain}
          >
            <Text style={{ color: "white", fontWeight: "bold" }}>
              {checkingAgain ? "Checking..." : "Check again"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryAction, { marginTop: 12, width: "100%", opacity: 0.8 }]}
            onPress={() => navigation.navigate("MainTabs")}
          >
            <Text style={{ color: "white", fontWeight: "bold" }}>
              Back to Home
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentAnalysis = sessionData?.analyses?.[0];
  const rawData = currentAnalysis?.rawData;
  const summary = sessionData?.summaryJson;
  const data = {
    overallScore: Math.min(
      100,
      summary?.overall_score ??
        currentAnalysis?.scores?.overall ??
        currentAnalysis?.scores?.overall_score ??
        0,
    ),
    cefrLevel: summary?.cefr_score ?? currentAnalysis?.cefrLevel ?? "B1",
    scores: {
      grammar: Math.min(
        100,
        summary?.grammar_score ??
          currentAnalysis?.scores?.grammar ??
          currentAnalysis?.scores?.grammar_score ??
          0,
      ),
      pronunciation: Math.min(
        100,
        summary?.pronunciation_score ??
          currentAnalysis?.scores?.pronunciation ??
          currentAnalysis?.scores?.pronunciation_score ??
          0,
      ),
      fluency: Math.min(
        100,
        summary?.fluency_score ??
          currentAnalysis?.scores?.fluency ??
          currentAnalysis?.scores?.fluency_score ??
          0,
      ),
      vocabulary: Math.min(
        100,
        summary?.vocabulary_score ??
          currentAnalysis?.scores?.vocabulary ??
          currentAnalysis?.scores?.vocabulary_score ??
          0,
      ),
      // Measured flags: absent (legacy rows) => treat as measured.
      grammarMeasured: currentAnalysis?.scores?.grammarMeasured !== false,
      pronunciationMeasured:
        currentAnalysis?.scores?.pronunciationMeasured !== false,
    },
    mistakes: currentAnalysis?.mistakes || [],
    pronunciationIssues: currentAnalysis?.pronunciationIssues || [],
    aiFeedback: (rawData as any)?.ai_detailed_feedback || null,
    summaryText:
      typeof (rawData as any)?.aiFeedback === "string"
        ? (rawData as any).aiFeedback
        : null,
    actionableFeedback: (rawData as any)?.actionable_feedback || null,
    wordLevelData: (rawData as any)?.detailed_errors?.word_level_scores || [],
    strengths: rawData?.strengths || [],
    improvementAreas: rawData?.improvementAreas || [],
    accentNotes: rawData?.accentNotes || null,
    pronunciationTip: rawData?.pronunciationTip || null,
    pronunciationFlagged:
      (sessionData?.summaryJson?.pronunciation_flagged as
        | { word?: string; error_type?: string; phoneme?: string }[]
        | undefined) ?? [],
    dominantPronunciationErrors:
      (sessionData?.summaryJson?.dominant_pronunciation_errors as string[]) ||
      [],
    fluencyBreakdown:
      ((rawData as Record<string, unknown> | undefined)?.fluencyBreakdown as
        | FluencyBreakdown
        | undefined) ||
      ((rawData as Record<string, unknown> | undefined)?.azureEvidence as
        | Record<string, unknown>
        | undefined)?.fluencyBreakdown as FluencyBreakdown | undefined,
    deliveryInsights:
      ((rawData as Record<string, unknown> | undefined)?.deliveryInsights as
        | DeliveryInsight[]
        | undefined) ?? undefined,
  };

  // MAYA Summary: derive weak spots (lowest 2 dimensions) and words to learn from real data
  const scoreEntries = [
    // Exclude grammar from weak-spot ranking when it wasn't measured — a
    // not_measured pillar must not surface as a "0" weak spot.
    ...(data.scores.grammarMeasured
      ? [{ key: "Grammar", score: data.scores.grammar, icon: "document-text" }]
      : []),
    { key: "Pronunciation", score: data.scores.pronunciation, icon: "mic" },
    { key: "Fluency", score: data.scores.fluency, icon: "flash" },
    { key: "Vocabulary", score: data.scores.vocabulary, icon: "book" },
  ];
  const weakSpots = [...scoreEntries]
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .filter((s) => s.score < 80);

  const wordsFromMistakes = (data.mistakes || [])
    .map((m: any) => m.corrected_text ?? m.corrected)
    .filter(Boolean)
    .filter((t: string) => t.trim().length > 0);
  const wordsFromPronunciation = (data.pronunciationIssues || [])
    .map((p: any) => {
      // Prefer new pipeline fields
      const correct = (p?.correct ?? "").trim();
      if (correct) return `${correct} (pron)`;
      // Legacy: parse out a usable correct word
      const parsed = parsePronunciationIssue(p);
      return parsed.correctWord ? `${parsed.correctWord} (pron)` : null;
    })
    .filter(Boolean);
  const advancedWords =
    ((rawData as any)?.ai_detailed_feedback?.vocabulary?.advanced_words as string[]) || []; 
  const wordsToLearn = Array.from(
    new Set([
      ...wordsFromMistakes.slice(0, 5),
      ...wordsFromPronunciation.slice(0, 6),
      ...advancedWords.slice(0, 5),
    ]),
  ).filter(Boolean) as string[];

  const mayaHasContent =
    data.summaryText ||
    weakSpots.length > 0 ||
    wordsToLearn.length > 0 ||
    data.mistakes.length > 0 ||
    data.improvementAreas.length > 0;

  // MAYA personality: one-line headline and top tip so it doesn't feel like raw data
  const mayaHeadline =
    data.overallScore >= 80
      ? "You're doing great — small tweaks will make you even stronger."
      : data.overallScore >= 60
        ? "Solid effort. Here's exactly where to focus to level up."
        : weakSpots.length > 0
          ? `${weakSpots[0].key} is your biggest lever — improve it and your score will jump.`
          : "Every call is practice. Here's what to work on next.";
  const mayaTopTip =
    data.improvementAreas?.[0] ||
    data.pronunciationTip ||
    (weakSpots.length > 0
      ? `Spend 5 minutes on ${weakSpots[0].key.toLowerCase()} before your next call.`
      : null);

  const overallColor = getScoreColor(data.overallScore, theme);

  // ── Build step items: up to 3 severe per category ────────
  const feedbackSteps: FeedbackStep[] = (() => {
    const steps: FeedbackStep[] = [];
    const PER_CAT = 3;

    // Pronunciation — sort ascending by confidence (lower = more severe)
    const sortedPron = [...(data.pronunciationIssues as any[])]
      .filter((p) => (p.correct ?? '').trim())
      .sort((a, b) => (a.confidence ?? 100) - (b.confidence ?? 100));
    for (const p of sortedPron.slice(0, PER_CAT)) {
      const spoken = (p.spoken ?? p.word ?? '').trim();
      const correct = (p.correct ?? '').trim();
      const ruleCategory = p.rule_category ?? p.issueType ?? '';
      steps.push({
        id: `pron_${steps.length}`,
        category: 'pronunciation',
        youSaid: spoken || correct,
        correct,
        correctionLabel: 'Correct:',
        ttsText: buildPronCoachingLine({
          spoken,
          correct,
          ruleCategory,
          firstName: user?.firstName ?? undefined,
        }),
      });
    }

    // Grammar — sort by severity field if present, else keep backend order
    const sortedGram = [...(data.mistakes as any[])]
      .filter((m) => (m.original_text ?? m.original ?? '').trim() && (m.corrected_text ?? m.corrected ?? '').trim())
      .sort((a, b) => {
        const sevOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (sevOrder[a.severity] ?? 1) - (sevOrder[b.severity] ?? 1);
      });
    for (const m of sortedGram.slice(0, PER_CAT)) {
      const youSaid = (m.original_text ?? m.original ?? '').trim();
      const correct = (m.corrected_text ?? m.corrected ?? '').trim();
      steps.push({
        id: `gram_${steps.length}`,
        category: 'grammar',
        youSaid,
        correct,
        correctionLabel: 'Correct:',
        ttsText: `You said "${youSaid}". The correct form is "${correct}".`,
      });
    }

    // Vocabulary from aiFeedback examples
    const vocabExamples = ((rawData as any)?.ai_detailed_feedback?.vocabulary?.examples) as any[] | undefined;
    if (vocabExamples?.length) {
      for (const ex of vocabExamples.slice(0, PER_CAT)) {
        const youSaid = (ex.original ?? ex.used ?? '').trim();
        const correct = (ex.better ?? ex.alternative ?? '').trim();
        if (!youSaid || !correct) continue;
        steps.push({
          id: `vocab_${steps.length}`,
          category: 'vocabulary',
          youSaid,
          correct,
          correctionLabel: 'Can also be:',
          ttsText: `You said "${youSaid}". You could also say "${correct}".`,
        });
      }
    }

    return steps;
  })();

  const aiDetailedFeedback = (rawData as any)?.ai_detailed_feedback ?? null;

  const feedbackSegments: FeedbackSegment[] = (() => {
    const segments: FeedbackSegment[] = [];

    const sortedPron = [...(data.pronunciationIssues as any[])]
      .filter((p) => (p.correct ?? '').trim())
      .sort((a, b) => (a.confidence ?? 100) - (b.confidence ?? 100));
    if (sortedPron.length) {
      const p = sortedPron[0];
      const spoken = (p.spoken ?? p.word ?? '').trim();
      const correct = (p.correct ?? '').trim();
      segments.push({
        id: 'pronunciation',
        category: 'pronunciation',
        youSaid: spoken || correct,
        correct,
        correctionLabel: 'Correct:',
        hasCorrectionCards: true,
      });
    }

    const sortedGram = [...(data.mistakes as any[])]
      .filter((m) => (m.original_text ?? m.original ?? '').trim() && (m.corrected_text ?? m.corrected ?? '').trim())
      .sort((a, b) => {
        const sevOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (sevOrder[a.severity] ?? 1) - (sevOrder[b.severity] ?? 1);
      });
    if (sortedGram.length) {
      const m = sortedGram[0];
      segments.push({
        id: 'grammar',
        category: 'grammar',
        youSaid: (m.original_text ?? m.original ?? '').trim(),
        correct: (m.corrected_text ?? m.corrected ?? '').trim(),
        correctionLabel: 'Correct:',
        hasCorrectionCards: true,
      });
    }

    const vocabExamples = aiDetailedFeedback?.vocabulary?.examples as any[] | undefined;
    if (vocabExamples?.length) {
      const ex = vocabExamples[0];
      const youSaid = (ex.original ?? ex.used ?? '').trim();
      const correct = (ex.better ?? ex.alternative ?? '').trim();
      if (youSaid && correct) {
        segments.push({
          id: 'vocabulary',
          category: 'vocabulary',
          youSaid,
          correct,
          correctionLabel: 'Can also be:',
          hasCorrectionCards: true,
        });
      }
    }

    const fluencyJust = aiDetailedFeedback?.fluency?.justification as string | undefined;
    const fb = data.fluencyBreakdown;
    const fluencyMetricsNote = fb
      ? `You spoke at ${Math.round(fb.wpm)} WPM (${paceLabel(fb.wpm)}).${
          (fb.fillerCount ?? 0) > 0
            ? ` ${fb.fillerCount} filler word${fb.fillerCount === 1 ? "" : "s"} detected${
                fb.topFillers?.length ? ` — try reducing "${fb.topFillers.slice(0, 2).join('", "')}"` : ""
              }.`
            : " Smooth pace with few fillers."
        }`
      : undefined;
    if (fluencyJust?.trim() || fluencyMetricsNote || data.deliveryInsights?.length || data.scores.fluency > 0) {
      segments.push({
        id: 'fluency',
        category: 'fluency',
        correctionLabel: '',
        hasCorrectionCards: false,
        fluencyNote:
          fluencyJust?.trim() ||
          fluencyMetricsNote ||
          'Focus on speaking at a steady pace with natural pauses between ideas.',
      });
    }

    return segments.slice(0, 4);
  })();

  const currentSegment = feedbackSegments[currentStepIdx] ?? null;

  const buildSegmentNarrationPayload = (segment: FeedbackSegment): FeedbackNarrationPayload => {
    const scores = sessionData?.analyses?.[0]?.scores as Record<string, number> | undefined;
    const summary = sessionData?.summaryJson;
    const sectionScores: Record<FeedbackSection, number> = {
      pronunciation: Math.min(100, summary?.pronunciation_score ?? scores?.pronunciation ?? data.scores.pronunciation ?? 0),
      grammar: Math.min(100, summary?.grammar_score ?? scores?.grammar ?? data.scores.grammar ?? 0),
      vocabulary: Math.min(100, summary?.vocabulary_score ?? scores?.vocabulary ?? data.scores.vocabulary ?? 0),
      fluency: Math.min(100, summary?.fluency_score ?? scores?.fluency ?? data.scores.fluency ?? 0),
    };
    const pronErrors = (data.pronunciationIssues as any[])
      .filter((p) => (p.correct ?? '').trim())
      .slice(0, 2)
      .map((p) => {
        const correct = (p.correct ?? '').trim();
        const spokenRaw = (p.spoken ?? p.word ?? '').trim();
        // Prefer real spoken when different; if missing/equal still send both for coaching.
        const spoken =
          spokenRaw && spokenRaw !== '—' ? spokenRaw : correct;
        return {
          spoken,
          correct,
          rule_category: p.rule_category ?? p.issueType,
        };
      });
    const grammarErrors = (data.mistakes as any[]).slice(0, 2).map((m) => ({
      original_text: m.original_text ?? m.original,
      corrected_text: m.corrected_text ?? m.corrected,
    }));
    const sectionErrors: Record<FeedbackSection, NarrationError[]> = {
      pronunciation: pronErrors,
      grammar: grammarErrors,
      vocabulary: [],
      fluency: [],
    };
    const sectionJustifications: Record<FeedbackSection, string | undefined> = {
      pronunciation: aiDetailedFeedback?.pronunciation?.justification,
      grammar: aiDetailedFeedback?.grammar?.justification,
      vocabulary: aiDetailedFeedback?.vocabulary?.justification,
      fluency: aiDetailedFeedback?.fluency?.justification ?? segment.fluencyNote,
    };
    return {
      section: segment.category,
      score: sectionScores[segment.category] ?? 0,
      justification: sectionJustifications[segment.category],
      errors: sectionErrors[segment.category],
      first_name: user?.firstName ?? undefined,
    };
  };

  const stopStepAudio = async () => {
    stopWordTracking();
    if (stepSoundRef.current) {
      await stepSoundRef.current.stopAsync().catch(() => {});
      await stepSoundRef.current.unloadAsync().catch(() => {});
      stepSoundRef.current = null;
      setStepAudioPlaying(false);
    }
  };

  const attachSegmentPlaybackHandlers = (
    sound: Audio.Sound,
    segment: FeedbackSegment,
    options?: { transitionFromIntro?: boolean },
  ) => {
    const hasCards = segment.hasCorrectionCards;
    // Token captured at attach time. A handler from a superseded sound will
    // see a stale token and must not write the ring shared value.
    const seqToken = segmentSeqRef.current;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      const isCurrent = segmentSeqRef.current === seqToken;
      if (options?.transitionFromIntro && status.isPlaying && !introAudioStartedRef.current) {
        introAudioStartedRef.current = true;
        setFeedbackPhase('step');
      }
      const duration = status.durationMillis ?? 0;
      const position = status.positionMillis ?? 0;
      if (duration > 0) {
        const ratio = position / duration;
        // Drive the circular progress ring (0→1) with the playback position.
        if (isCurrent) segmentProgress.value = Math.min(1, Math.max(0, ratio));
        if (hasCards) {
          if (ratio >= 0.22) setCardReveal((prev) => (prev === 'none' ? 'youSaid' : prev));
          if (ratio >= 0.52) setCardReveal('both');
        } else if (ratio >= 0.18) {
          setCardReveal('both');
        }
      } else if (hasCards && position > 400) {
        setCardReveal('youSaid');
      } else if (!hasCards && position > 300) {
        setCardReveal('both');
      }
      if (status.didJustFinish) {
        if (hasCards) setCardReveal('both');
        // Snap the ring to full when the clip ends — only if still the
        // current segment, so a stale finish can't flash the new ring.
        if (isCurrent) segmentProgress.value = withTiming(1, { duration: 180 });
        sound.unloadAsync().catch(() => {});
        if (isCurrent) {
          stepSoundRef.current = null;
          setStepAudioPlaying(false);
          stopWordTracking();
        }
      }
    });
  };

  const prefetchSegmentNarration = (segment: FeedbackSegment) => {
    const payload = buildSegmentNarrationPayload(segment);
    const key = `clips:${JSON.stringify(payload)}`;
    prefetchTtsFileUri(`${key}:0`, async () => {
      const result = await fetchFeedbackNarration(payload);
      return result.clips?.[0]?.audio_base64 || result.audio_base64 || '';
    });
  };

  /** Play stitched clips (coaching → slow words) or a single fallback URI. */
  const playSegmentClipPlaylist = async (
    uris: string[],
    segment: FeedbackSegment,
    options?: { transitionFromIntro?: boolean },
  ) => {
    const seqToken = segmentSeqRef.current;
    const hasCards = segment.hasCorrectionCards;
    let index = 0;

    const playNext = async () => {
      if (segmentSeqRef.current !== seqToken) return;
      if (index >= uris.length) {
        if (hasCards) setCardReveal('both');
        segmentProgress.value = withTiming(1, { duration: 180 });
        stepSoundRef.current = null;
        setStepAudioPlaying(false);
        stopWordTracking();
        return;
      }
      const ratioBase = index / Math.max(1, uris.length);
      segmentProgress.value = ratioBase;
      if (hasCards && index === 0) {
        setCardReveal('youSaid');
      } else if (hasCards && index >= 1) {
        setCardReveal('both');
      } else if (!hasCards) {
        setCardReveal('both');
      }

      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: uris[index] },
        {
          shouldPlay: true,
          rate: index === 0 ? 0.92 : 1.0,
          shouldCorrectPitch: true,
        },
      );
      if (segmentSeqRef.current !== seqToken) {
        await sound.unloadAsync().catch(() => {});
        return;
      }
      stepSoundRef.current = sound;
      if (options?.transitionFromIntro && index === 0) {
        introAudioStartedRef.current = true;
        setFeedbackPhase('step');
      }
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (segmentSeqRef.current !== seqToken) return;
        const duration = status.durationMillis ?? 0;
        const position = status.positionMillis ?? 0;
        if (duration > 0) {
          const local = position / duration;
          segmentProgress.value = Math.min(
            1,
            ratioBase + local / Math.max(1, uris.length),
          );
        }
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          if (stepSoundRef.current === sound) stepSoundRef.current = null;
          index += 1;
          void playNext();
        }
      });
    };

    setStepAudioPlaying(true);
    await playNext();
  };

  const startSegmentAudio = async (
    segment: FeedbackSegment,
    options?: { transitionFromIntro?: boolean },
  ) => {
    setStepAudioLoading(true);
    setCardReveal('none');
    // New segment playback → fresh token; invalidates any stale status handler.
    segmentSeqRef.current += 1;
    segmentProgress.value = 0;
    if (options?.transitionFromIntro) introAudioStartedRef.current = false;
    try {
      const payload = buildSegmentNarrationPayload(segment);
      const result = await fetchFeedbackNarration(payload);
      const clipList =
        result.clips && result.clips.length > 0
          ? result.clips.filter((c) => c.audio_base64)
          : result.audio_base64
            ? [{ role: 'coaching', text: result.text, audio_base64: result.audio_base64 }]
            : [];

      const uris: string[] = [];
      for (let i = 0; i < clipList.length; i++) {
        const clip = clipList[i];
        const cacheKey = `narration:${payload.section}:${clip.role}:${clip.text}`;
        const uri = await getOrFetchTtsFileUri(cacheKey, async () => clip.audio_base64);
        if (uri) uris.push(uri);
      }

      if (uris.length === 0) {
        setStepAudioLoading(false);
        if (options?.transitionFromIntro) setFeedbackPhase('step');
        if (!segment.hasCorrectionCards) {
          setCardReveal('both');
        }
        return;
      }
      const segIdx = feedbackSegments.findIndex((s) => s.id === segment.id);
      const nextSeg = segIdx >= 0 ? feedbackSegments[segIdx + 1] : undefined;
      if (nextSeg) prefetchSegmentNarration(nextSeg);

      setStepAudioLoading(false);
      await playSegmentClipPlaylist(uris, segment, options);
    } catch {
      setStepAudioLoading(false);
      setStepAudioPlaying(false);
      if (options?.transitionFromIntro) setFeedbackPhase('step');
      if (!segment.hasCorrectionCards) {
        setCardReveal('both');
      }
    }
  };

  const handleStepPlay = async (segment: FeedbackSegment) => {
    if (stepAudioPlaying) {
      await stopStepAudio();
      return;
    }
    await startSegmentAudio(segment);
  };

  const handleStepReplay = async (segment: FeedbackSegment) => {
    await stopStepAudio();
    await startSegmentAudio(segment);
  };

  /** Summary list: coaching line + slow correct word (stitched). */
  const playFeedbackStepSnippet = async (step: FeedbackStep) => {
    if (stepAudioPlaying) {
      await stopStepAudio();
      return;
    }
    setStepAudioLoading(true);
    segmentSeqRef.current += 1;
    const seqToken = segmentSeqRef.current;
    try {
      const slowWord = (step.correct ?? '').trim();
      const coachUri = await getOrFetchTtsFileUri(`snippet:${step.ttsText}`, async () => {
        const result = await fetchErrorSpeak(step.ttsText);
        return result.audio_base64 ?? '';
      });
      if (!coachUri) {
        setStepAudioLoading(false);
        return;
      }
      const uris = [coachUri];
      if (slowWord) {
        const slowUri = await getOrFetchTtsFileUri(`snippet-slow:${slowWord}`, async () => {
          const result = await fetchErrorSpeak(slowWord, { speakingRate: 0.42 });
          return result.audio_base64 ?? '';
        });
        if (slowUri) uris.push(slowUri);
      }
      setStepAudioLoading(false);
      setStepAudioPlaying(true);
      let index = 0;
      const playNext = async () => {
        if (segmentSeqRef.current !== seqToken) return;
        if (index >= uris.length) {
          stepSoundRef.current = null;
          setStepAudioPlaying(false);
          return;
        }
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: uris[index] },
          { shouldPlay: true },
        );
        if (segmentSeqRef.current !== seqToken) {
          await sound.unloadAsync().catch(() => {});
          return;
        }
        stepSoundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            if (stepSoundRef.current === sound) stepSoundRef.current = null;
            index += 1;
            void playNext();
          }
        });
      };
      await playNext();
    } catch {
      setStepAudioLoading(false);
      setStepAudioPlaying(false);
    }
  };

  const handleNextStep = async () => {
    await stopStepAudio();
    if (currentStepIdx < feedbackSegments.length - 1) {
      const nextIdx = currentStepIdx + 1;
      const nextSeg = feedbackSegments[nextIdx];
      setCurrentStepIdx(nextIdx);
      if (nextSeg) await startSegmentAudio(nextSeg);
    } else {
      setFeedbackPhase('summary');
    }
  };

  const handleIntroPlay = async () => {
    // Synchronous re-entrancy guard: a rapid double-tap must not start two
    // TTS fetches / two Audio.Sound objects (the first would leak).
    if (introPlayInFlightRef.current) return;
    introPlayInFlightRef.current = true;
    try {
      if (!feedbackSegments.length) {
        setFeedbackPhase('summary');
        return;
      }
      setCurrentStepIdx(0);
      // The bottom-sheet rise is driven by the feedbackPhase useEffect.
      await startSegmentAudio(feedbackSegments[0], { transitionFromIntro: true });
    } finally {
      introPlayInFlightRef.current = false;
    }
  };

  const scoreLabel =
    data.overallScore >= 85 ? 'Great Progress!' :
    data.overallScore >= 70 ? 'Good Work!' :
    data.overallScore >= 55 ? 'Keep Practicing!' : 'Keep Going!';

  const screenBg = theme.colors.background;
  const stepCardBg = `${String(theme.colors.surface)}EE`;
  const stepCardBorder = `${String(theme.colors.border)}CC`;
  const errorSurface = `${String(theme.colors.error)}14`;
  const successSurface = `${String(theme.colors.success)}14`;
  const segmentCategoryLabel = (cat: FeedbackSection) =>
    cat.charAt(0).toUpperCase() + cat.slice(1);

  // ── Intro phase ───────────────────────────────────────────
  if (feedbackPhase === 'intro') {
    const introSkills = [
      {
        key: 'pronunciation' as const,
        label: 'Pronunciation',
        icon: 'mic',
        score: data.scores.pronunciation,
        measured: data.scores.pronunciationMeasured !== false,
      },
      {
        key: 'grammar' as const,
        label: 'Grammar',
        icon: 'document-text',
        score: data.scores.grammar,
        measured: data.scores.grammarMeasured !== false,
      },
      {
        key: 'fluency' as const,
        label: 'Fluency',
        icon: 'flash',
        score: data.scores.fluency,
        measured: true,
      },
      {
        key: 'vocabulary' as const,
        label: 'Vocabulary',
        icon: 'book',
        score: data.scores.vocabulary,
        measured: true,
      },
    ];
    const skillColor = (key: 'pronunciation' | 'grammar' | 'fluency' | 'vocabulary') =>
      key === 'fluency'
        ? theme.colors.primary
        : STEP_CATEGORY_COLORS[key];
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: screenBg }} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text.primary} />
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: theme.colors.text.primary }}>
            Feedback
          </Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Compact score preview card */}
          <Animated.View
            entering={FadeInDown.duration(320)}
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 20,
              padding: 20,
              shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 }, elevation: 3,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: overallColor + '18',
                alignItems: 'center', justifyContent: 'center', marginRight: 16,
              }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: overallColor }}>
                  {data.overallScore}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: theme.colors.text.secondary, marginBottom: 2 }}>
                  Overall Score
                </Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text.primary }}>
                  {scoreLabel}
                </Text>
              </View>
            </View>
            <View style={{ gap: 12 }}>
              {introSkills.map((s) => {
                const c = skillColor(s.key);
                const pct = Math.min(100, Math.max(0, s.score));
                return (
                  <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{
                      width: 28, height: 28, borderRadius: 8,
                      backgroundColor: c + '15',
                      alignItems: 'center', justifyContent: 'center', marginRight: 10,
                    }}>
                      <Ionicons name={s.icon as any} size={15} color={c} />
                    </View>
                    <Text style={{ width: 96, fontSize: 13, color: theme.colors.text.primary, fontWeight: '500' }}>
                      {s.label}
                    </Text>
                    <View style={{
                      flex: 1, height: 6, borderRadius: 3,
                      backgroundColor: theme.colors.text.secondary + '20', overflow: 'hidden',
                    }}>
                      {s.measured ? (
                        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: c, borderRadius: 3 }} />
                      ) : null}
                    </View>
                    <Text
                      style={{
                        width: s.measured ? 40 : 52,
                        textAlign: 'right',
                        fontSize: 13,
                        fontWeight: '700',
                        color: s.measured ? c : theme.colors.text.secondary,
                        fontStyle: s.measured ? 'normal' : 'italic',
                      }}
                    >
                      {s.measured ? `${pct}%` : 'N/A'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Animated.View>

          <Text style={{
            marginTop: 24, textAlign: 'center', fontSize: 14,
            color: theme.colors.text.secondary, lineHeight: 21,
          }}>
            Tap play to hear a quick, segment-by-segment walkthrough of your feedback.
          </Text>

          <TouchableOpacity onPress={() => setFeedbackPhase('detail')} style={{ marginTop: 16, alignSelf: 'center' }} activeOpacity={0.7}>
            <Text style={{ color: theme.colors.primary, fontSize: 14, fontWeight: '600' }}>
              Skip to full analysis
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Floating play button */}
        <View
          style={{
            position: 'absolute', left: 0, right: 0,
            bottom: Math.max(insets.bottom, 16) + 12,
            alignItems: 'center',
          }}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              if (!stepAudioLoading) handleIntroPlay();
            }}
            disabled={stepAudioLoading}
            style={{
              width: 76, height: 76, borderRadius: 38, overflow: 'hidden',
              shadowColor: theme.colors.primary, shadowOpacity: 0.4,
              shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
            }}
          >
            <LinearGradient
              colors={theme.colors.gradients.primary as any}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              {stepAudioLoading
                ? <ActivityIndicator size="small" color="white" />
                : <Ionicons name="play" size={34} color="white" style={{ marginLeft: 3 }} />
              }
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Step phase (4 segments: pronunciation, grammar, vocabulary, fluency) ─
  if (feedbackPhase === 'step' && currentSegment) {
    const catColor =
      currentSegment.category === 'fluency'
        ? theme.colors.primary
        : STEP_CATEGORY_COLORS[currentSegment.category as keyof typeof STEP_CATEGORY_COLORS] ?? theme.colors.primary;
    const catBg =
      currentSegment.category === 'fluency'
        ? theme.colors.surface
        : STEP_CATEGORY_BG[currentSegment.category as keyof typeof STEP_CATEGORY_BG] ?? theme.colors.surface;
    const showYouSaid =
      currentSegment.hasCorrectionCards &&
      (cardReveal === 'youSaid' || cardReveal === 'both');
    const showCorrect =
      currentSegment.hasCorrectionCards && cardReveal === 'both';

    // Replay/Next gate: appears as soon as the segment's content is fully
    // revealed (cardReveal === 'both') — both for correction-card segments
    // and for the single-insight fluency segment.
    const controlsUnlocked = cardReveal === 'both';

    return (
      <View style={{ flex: 1, backgroundColor: screenBg }}>
        <StatusBar barStyle="dark-content" />
        {/* Bottom-sheet card that rises up into place on play */}
        <Animated.View style={[{ flex: 1, backgroundColor: screenBg }, sheetAnimatedStyle]}>
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
              <TouchableOpacity
                onPress={async () => {
                  await stopStepAudio();
                  if (currentStepIdx > 0) {
                    const prev = feedbackSegments[currentStepIdx - 1];
                    setCurrentStepIdx((i) => i - 1);
                    setCardReveal('none');
                    if (prev) await startSegmentAudio(prev);
                  } else {
                    // The feedbackPhase useEffect resets the sheet off-screen.
                    introAudioStartedRef.current = false;
                    setFeedbackPhase('intro');
                  }
                }}
                hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
              >
                <Ionicons name="arrow-back" size={22} color={theme.colors.text.primary} />
              </TouchableOpacity>
              <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: theme.colors.text.primary }}>
                Feedback
              </Text>
              <Text style={{ fontSize: 13, color: theme.colors.text.secondary, fontWeight: '500' }}>
                {currentStepIdx + 1} / {feedbackSegments.length}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 10 }}>
              {feedbackSegments.map((_, i) => (
                <View key={i} style={{
                  width: i === currentStepIdx ? 20 : 7, height: 7, borderRadius: 4,
                  backgroundColor: i === currentStepIdx ? theme.colors.primary : theme.colors.text.secondary + '40',
                }} />
              ))}
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}>
              <View style={{
                backgroundColor: theme.colors.surface, borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 20,
                shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3,
              }}>
                {/* Play/pause button with animated circular progress ring */}
                <View style={{
                  width: SEG_RING_SIZE, height: SEG_RING_SIZE,
                  alignItems: 'center', justifyContent: 'center', marginBottom: 12,
                }}>
                  <SegmentProgressRing
                    progress={segmentProgress}
                    color={catColor}
                    track={theme.colors.text.secondary + '25'}
                  />
                  <TouchableOpacity
                    onPress={() => handleStepPlay(currentSegment)}
                    activeOpacity={0.85}
                    style={{
                      width: 60, height: 60, borderRadius: 30,
                      backgroundColor: catColor + '15',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {stepAudioLoading
                      ? <ActivityIndicator size="small" color={catColor} />
                      : <Ionicons name={stepAudioPlaying ? 'pause' : 'play'} size={26} color={catColor} style={stepAudioPlaying ? undefined : { marginLeft: 2 }} />
                    }
                  </TouchableOpacity>
                </View>
                {/* Segment X of N label */}
                <Text style={{ fontSize: 13, fontWeight: '700', color: catColor, marginBottom: 4 }}>
                  Segment {currentStepIdx + 1} of {feedbackSegments.length}
                </Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text.primary, marginBottom: 6 }}>Your Feedback</Text>
                <Text style={{ fontSize: 13, color: theme.colors.text.secondary, textAlign: 'center', lineHeight: 20 }}>
                  {stepAudioPlaying
                    ? 'Listen to your personalized feedback…'
                    : 'Tap the play button to listen to your personalized feedback'}
                </Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: catColor, marginBottom: 12 }}>
                {segmentCategoryLabel(currentSegment.category)}
              </Text>
              {currentSegment.hasCorrectionCards ? (
                <>
                  {showYouSaid && (
                    <Animated.View
                      entering={FadeInDown.duration(280)}
                      style={{
                        borderLeftWidth: 4,
                        borderLeftColor: theme.colors.error,
                        backgroundColor: errorSurface,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: `${String(theme.colors.error)}40`,
                        padding: 16,
                        marginBottom: 10,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: theme.colors.error, fontWeight: '800', marginBottom: 6, letterSpacing: 0.3 }}>You Said</Text>
                      <Text style={{ fontSize: 15, color: theme.colors.text.primary, lineHeight: 22 }}>{currentSegment.youSaid}</Text>
                    </Animated.View>
                  )}
                  {showCorrect && (
                    <Animated.View
                      entering={FadeInDown.duration(280)}
                      style={{
                        borderLeftWidth: 4,
                        borderLeftColor: catColor,
                        backgroundColor: successSurface,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: `${String(catColor)}50`,
                        padding: 16,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: catColor, fontWeight: '800', marginBottom: 6, letterSpacing: 0.3 }}>{String(currentSegment.correctionLabel).replace(':', '')}</Text>
                      <Text style={{ fontSize: 15, color: theme.colors.text.primary, lineHeight: 22 }}>{currentSegment.correct}</Text>
                    </Animated.View>
                  )}
                </>
              ) : (
                cardReveal === 'both' && (
                  <Animated.View
                    entering={FadeInDown.duration(280)}
                    style={{
                      borderLeftWidth: 4,
                      borderLeftColor: catColor,
                      backgroundColor: successSurface,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: `${String(catColor)}50`,
                      padding: 16,
                    }}
                  >
                    <Text style={{ fontSize: 15, color: theme.colors.text.primary, lineHeight: 22 }}>{currentSegment.fluencyNote}</Text>
                    {currentSegment.category === 'fluency' && data.fluencyBreakdown ? (
                      <View style={{ marginTop: 14 }}>
                        <FluencyMetricsSection
                          breakdown={data.fluencyBreakdown}
                          compact
                        />
                      </View>
                    ) : null}
                    {currentSegment.category === 'fluency' && data.deliveryInsights?.length ? (
                      <View style={{ marginTop: 14 }}>
                        <DeliveryInsightsCard insights={data.deliveryInsights} />
                      </View>
                    ) : null}
                  </Animated.View>
                )
              )}
            </ScrollView>
            {controlsUnlocked ? (
              <View style={{
                flexDirection: 'row', gap: 12, paddingHorizontal: 20,
                paddingBottom: Math.max(insets.bottom, 16), paddingTop: 12, backgroundColor: screenBg,
              }}>
                <TouchableOpacity
                  onPress={() => handleStepReplay(currentSegment)}
                  activeOpacity={0.8}
                  style={{ flex: 1, paddingVertical: 16, borderRadius: 50, borderWidth: 1.5, borderColor: theme.colors.text.secondary + '40', alignItems: 'center', backgroundColor: theme.colors.surface }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.text.primary }}>Replay</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleNextStep}
                  activeOpacity={0.85}
                  style={{ flex: 1, paddingVertical: 16, borderRadius: 50, backgroundColor: theme.colors.primary, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: 'white' }}>
                    {currentStepIdx < feedbackSegments.length - 1 ? 'Next' : 'Done'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ paddingBottom: Math.max(insets.bottom, 16), paddingTop: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: theme.colors.text.secondary }}>
                  Replay and Next unlock as your feedback is revealed
                </Text>
              </View>
            )}
          </SafeAreaView>
        </Animated.View>
      </View>
    );
  }

  // ── Summary phase (also catches step-with-no-currentSegment edge case) ─
  if (feedbackPhase === 'summary' || (feedbackPhase === 'step' && !currentSegment)) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: screenBg }} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <TouchableOpacity
          onPress={() => {
            if (feedbackSegments.length > 0) {
              setCurrentStepIdx(feedbackSegments.length - 1);
              setFeedbackPhase('step');
            }
            else setFeedbackPhase('intro');
          }}
          hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text.primary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: theme.colors.text.primary }}>
          Feedback
        </Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}>
        <LinearGradient
          colors={theme.colors.gradients.primary as any}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, paddingVertical: 36, paddingHorizontal: 24, alignItems: 'center', marginBottom: 28 }}
        >
          <View style={{
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
          }}>
            <Text style={{ fontSize: 30, fontWeight: '800', color: theme.colors.primary }}>{data.overallScore}%</Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '700', color: 'white', marginBottom: 8 }}>{scoreLabel}</Text>
          <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>You're improving your English skills</Text>
        </LinearGradient>
        {feedbackSteps.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 }}>Areas Reviewed</Text>
            {(['pronunciation', 'grammar', 'vocabulary'] as const).map((cat) => {
              const catSteps = feedbackSteps.filter((s) => s.category === cat);
              if (!catSteps.length) return null;
              const catCol = STEP_CATEGORY_COLORS[cat];
              const catBgColor = STEP_CATEGORY_BG[cat];
              const catIcon: any = cat === 'pronunciation' ? 'mic' : cat === 'grammar' ? 'document-text' : 'book';
              return (
                <View key={cat} style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <View style={{
                      width: 30, height: 30, borderRadius: 8,
                      backgroundColor: catBgColor, alignItems: 'center', justifyContent: 'center', marginRight: 10,
                    }}>
                      <Ionicons name={catIcon} size={15} color={catCol} />
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: catCol }}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </View>
                  {catSteps.map((step) => (
                    <View key={step.id} style={{
                      backgroundColor: stepCardBg, borderRadius: 12, padding: 14, marginBottom: 8,
                      borderWidth: 1, borderColor: stepCardBorder,
                      flexDirection: 'row', alignItems: 'flex-start',
                      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
                    }}>
                      <View style={{ flex: 1 }}>
                        <View style={{
                          backgroundColor: errorSurface,
                          borderRadius: 8,
                          padding: 10,
                          marginBottom: 8,
                          borderWidth: 1,
                          borderColor: `${String(theme.colors.error)}40`,
                        }}>
                          <Text style={{ fontSize: 11, color: theme.colors.error, fontWeight: '800', marginBottom: 3, letterSpacing: 0.2 }}>You Said</Text>
                          <Text style={{ fontSize: 14, color: theme.colors.text.primary }}>{step.youSaid}</Text>
                        </View>
                        <View style={{
                          backgroundColor: successSurface,
                          borderRadius: 8,
                          padding: 10,
                          borderWidth: 1,
                          borderColor: `${String(catCol)}50`,
                        }}>
                          <Text style={{ fontSize: 11, color: catCol, fontWeight: '800', marginBottom: 3, letterSpacing: 0.2 }}>{String(step.correctionLabel).replace(':', '')}</Text>
                          <Text style={{ fontSize: 14, color: theme.colors.text.primary }}>{step.correct}</Text>
                        </View>
                      </View>
                      <TouchableOpacity onPress={() => playFeedbackStepSnippet(step)} style={{ padding: 8, marginLeft: 10 }} activeOpacity={0.7}>
                        <Ionicons name="volume-medium-outline" size={22} color={catCol} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        )}
        <TouchableOpacity
          onPress={() => setFeedbackPhase('detail')}
          activeOpacity={0.85}
          style={{ borderRadius: 16, overflow: 'hidden' }}
        >
          <LinearGradient
            colors={theme.colors.gradients.primary as any}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ paddingVertical: 18, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>View Full Analysis</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // ── Detail phase (existing full feedback screen) ──────────

  return (
    <SafeAreaView edges={["bottom"]} style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <LinearGradient
          colors={theme.colors.gradients.surface as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.headerGradient,
            { paddingTop: Math.max(insets.top, 16) },
          ]}
        >
          <TouchableOpacity
            style={styles.backChip}
            onPress={() => setFeedbackPhase('summary')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={theme.colors.text.primary}
            />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Call Feedback</Text>
            <Text style={styles.headerSubtitle}>
              Your session insights and corrections
            </Text>
          </View>

          <View style={styles.backChipSpacer} />
        </LinearGradient>

        <View style={styles.detailSectionBlock}>
        <Text style={styles.detailSectionLabel}>Session</Text>
        <Text style={styles.detailSectionSubtitle}>
          Listen to your full feedback, then review scores and corrections below
        </Text>
        <View style={styles.helpfulRow}>
          <Text style={styles.helpfulPrompt}>Was this feedback helpful?</Text>
          <View style={styles.helpfulButtons}>
            <TouchableOpacity
              style={styles.helpfulBtn}
              onPress={() =>
                analytics.capture(
                  AnalyticsEvents.FEEDBACK_HELPFUL_YES,
                  analyticsMeta({ session_id: sessionData?.id ?? null }),
                )
              }
            >
              <Ionicons name="thumbs-up-outline" size={14} color={theme.colors.success} />
              <Text style={styles.helpfulBtnText}>Yes</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.helpfulBtn}
              onPress={() =>
                analytics.capture(
                  AnalyticsEvents.FEEDBACK_HELPFUL_NO,
                  analyticsMeta({ session_id: sessionData?.id ?? null }),
                )
              }
            >
              <Ionicons name="thumbs-down-outline" size={14} color={theme.colors.error} />
              <Text style={styles.helpfulBtnText}>No</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Listen to Feedback button ── */}
        <Animated.View entering={FadeInDown.delay(20).springify()} style={styles.listenBtnWrapper}>
          <TouchableOpacity
            style={[
              styles.listenBtn,
              isPlayingFullFeedback && styles.listenBtnPlaying,
            ]}
            onPress={handlePlayFullFeedback}
            activeOpacity={0.85}
            disabled={isLoadingFullFeedback}
          >
            <LinearGradient
              colors={
                isPlayingFullFeedback
                  ? ["#7C3AED", "#5B21B6"]
                  : (theme.colors.gradients.primary as any)
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {isLoadingFullFeedback ? (
              <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
            ) : (
              <Ionicons
                name={isPlayingFullFeedback ? "stop-circle" : "headset"}
                size={20}
                color="#fff"
                style={{ marginRight: 8 }}
              />
            )}
            <Text style={styles.listenBtnText}>
              {isLoadingFullFeedback
                ? "Preparing audio..."
                : isPlayingFullFeedback
                ? "Stop"
                : "Listen to Feedback"}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {ttsSubtitle && (
          <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.subtitleBox}>
            {wordTimestamps.length > 0 ? (
              <Text style={styles.subtitleText}>
                {wordTimestamps.map((wt, i) => (
                  <Text
                    key={i}
                    style={[
                      styles.subtitleWord,
                      i === currentWordIdx && styles.subtitleWordActive,
                    ]}
                  >
                    {wt.word}{' '}
                  </Text>
                ))}
              </Text>
            ) : (
              <Text style={styles.subtitleText}>{ttsSubtitle}</Text>
            )}
          </Animated.View>
        )}
        </View>

        <View style={[styles.detailSectionBlock, { marginTop: theme.spacing.m }]}>
        <Text style={styles.detailSectionLabel}>Overview</Text>
        <Text style={styles.detailSectionSubtitle}>
          Partner, topic, and your overall result for this call
        </Text>

        {/* Meta Info */}
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          style={styles.metaRow}
        >
          <View style={styles.metaPill}>
            <Ionicons
              name="person"
              size={12}
              color={theme.colors.text.secondary}
            />
            <Text style={styles.metaText}>{partnerName}</Text>
          </View>
          <View style={styles.metaPill}>
            <Ionicons
              name="chatbubbles"
              size={12}
              color={theme.colors.text.secondary}
            />
            <Text style={styles.metaText}>{topic}</Text>
          </View>
          {callDuration > 0 && (
            <View style={styles.metaPill}>
              <Ionicons
                name="time"
                size={12}
                color={theme.colors.text.secondary}
              />
              <Text style={styles.metaText}>
                {formatDuration(callDuration)}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Score Hero Card */}
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          style={styles.scoreCard}
        >
          <LinearGradient
            colors={theme.colors.gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.scoreGradient}
          >
            <Text style={styles.scoreLabel}>Overall Score</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.scoreValue}>{data.overallScore}</Text>
              <Text style={styles.scoreMax}>/100</Text>
            </View>
            <View style={[styles.levelChip, { backgroundColor: getLevelColor(theme, data.cefrLevel.toLowerCase() as any) }]}>
              <Text style={styles.levelChipText}>{data.cefrLevel}</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* What your score means — theme-aware gradient card (readable on dark UI) */}
        <Animated.View
          entering={FadeInDown.delay(220).springify()}
          style={styles.whatItMeansWrap}
        >
          <LinearGradient
            colors={[
              theme.theme.gradients.card[0],
              theme.theme.gradients.card[1],
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.whatItMeansGradient}
          >
            <View
              style={[
                styles.whatItMeansAccentBar,
                { backgroundColor: theme.colors.primary },
              ]}
            />
            <View style={styles.whatItMeansInner}>
              <View style={styles.whatItMeansHeader}>
                <View
                  style={[
                    styles.whatItMeansIconBadge,
                    {
                      backgroundColor: theme.colors.primary + "18",
                      borderColor: theme.colors.primary + "40",
                    },
                  ]}
                >
                  <Ionicons
                    name="sparkles"
                    size={22}
                    color={theme.colors.primary}
                  />
                </View>
                <View style={styles.whatItMeansHeaderText}>
                  <Text style={styles.whatItMeansKicker}>
                    {data.overallScore >= 80
                      ? "Strong session"
                      : data.overallScore >= 60
                        ? "Solid progress"
                        : "Growth focus"}
                  </Text>
                  <Text style={styles.whatItMeansTitle}>
                    What this score means
                  </Text>
                </View>
                <View
                  style={[
                    styles.whatItMeansCefrPill,
                    {
                      backgroundColor: theme.colors.primary + "20",
                      borderColor: theme.colors.primary + "45",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.whatItMeansCefrText,
                      { color: theme.colors.primary },
                    ]}
                  >
                    {data.cefrLevel}
                  </Text>
                </View>
              </View>
              <Text style={styles.whatItMeansText}>
                {data.overallScore >= 80
                  ? `At ${data.cefrLevel}, you communicated clearly and kept the conversation moving. Use the breakdown below to fine-tune pronunciation, grammar, and vocabulary.`
                  : data.overallScore >= 60
                    ? `At ${data.cefrLevel}, you’re building steady habits. The sections below highlight the highest-impact fixes so you can level up faster.`
                    : `At ${data.cefrLevel}, every practice call counts. Your score blends pronunciation, grammar, fluency, and vocabulary — dig into the tabs below for concrete next steps.`}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>
        </View>

        <View style={styles.detailSectionBlock}>
        <Text style={styles.detailSectionLabel}>Skill scores</Text>
        <Text style={styles.detailSectionSubtitle}>
          How pronunciation, grammar, vocabulary, and fluency contributed
        </Text>

        {/* Cap notification banner: pronunciation is holding score back */}
        {(sessionData?.summaryJson?.pronunciation_cefr_cap ||
          (data?.scores?.grammarMeasured !== false &&
            data?.scores?.pronunciation != null &&
            data?.scores?.grammar != null &&
            data.scores.pronunciation < data.scores.grammar - 15)) && (
          <Animated.View
            entering={FadeInDown.delay(80).springify()}
            style={styles.capBanner}
          >
            <View style={styles.capBannerContent}>
              <Text style={styles.capBannerTitle}>
                Pronunciation is holding back your score
              </Text>
              <Text style={styles.capBannerSubtitle}>
                {sessionData?.summaryJson?.dominant_pronunciation_errors?.length
                  ? `Focus on ${sessionData.summaryJson.dominant_pronunciation_errors
                      .slice(0, 2)
                      .join(" and ")
                      .replace(/_/g, " ")} to level up.`
                  : "Your pronunciation score is significantly lower than your grammar score. Practice the highlighted words to improve."}
              </Text>
              <TouchableOpacity
                style={styles.capBannerCta}
                onPress={() => navigation.getParent()?.navigate("MainTabs", { screen: "eBites" })}
                activeOpacity={0.8}
              >
                <Text style={styles.capBannerCtaText}>Watch Reels</Text>
                <Ionicons name="play-circle" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {cqsData && (
          <CallQualityScoreCard 
            cqs={cqsData.cqs} 
            breakdown={cqsData.breakdown} 
          />
        )}

        {/* New Score Breakdown */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <ScoreBreakdownCard
            scores={data.scores}
            // When pronunciation is still processing, older pipeline used to show 50 as a sentinel.
            // If we ever see exactly 50, treat it as "arriving" rather than a real score.
            pronunciationProcessing={
              data.scores.pronunciation === 50 &&
              (data.pronunciationIssues?.length ?? 0) === 0 &&
              pronPollCount < MAX_PRON_POLLS
            }
            justifications={{
              pronunciation: data.aiFeedback?.pronunciation?.justification,
              grammar: data.aiFeedback?.grammar?.justification,
              vocabulary: data.aiFeedback?.vocabulary?.justification,
              fluency: data.aiFeedback?.fluency?.justification,
            }}
            playingSection={playingSection}
            loadingSection={loadingSection}
            onPlay={handlePlay}
          />
          {data.scores.pronunciation === 50 &&
          (data.pronunciationIssues?.length ?? 0) === 0 &&
          pronPollCount < MAX_PRON_POLLS ? (
            <Text
              style={{
                marginTop: 8,
                marginHorizontal: 4,
                fontSize: 13,
                color: theme.colors.text.secondary,
              }}
            >
              Refining pronunciation analysis…
            </Text>
          ) : null}
        </Animated.View>

        {data.fluencyBreakdown && (
          <Animated.View entering={FadeInDown.delay(350).springify()}>
            <FluencyMetricsSection
              breakdown={data.fluencyBreakdown}
              compact={false}
            />
          </Animated.View>
        )}

        {data.deliveryInsights?.length ? (
          <Animated.View entering={FadeInDown.delay(400).springify()}>
            <DeliveryInsightsCard insights={data.deliveryInsights} />
          </Animated.View>
        ) : null}

        {/* Full conversation transcript (grammar + pronunciation highlighted) */}
        {(sessionData?.feedback?.transcript ?? sessionData?.summaryJson?.transcript) && (
          <Animated.View
            entering={FadeInDown.delay(120).springify()}
            style={styles.transcriptSection}
          >
            <TouchableOpacity
              style={styles.transcriptToggleRow}
              activeOpacity={0.8}
              onPress={() => setTranscriptExpanded((v) => !v)}
            >
              <Text style={styles.transcriptToggleLabel}>
                {transcriptExpanded ? "Hide conversation" : "Show conversation"}
              </Text>
              <Ionicons
                name={transcriptExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={theme.colors.text.secondary}
              />
            </TouchableOpacity>
            {transcriptExpanded && (
              <>
                {(data.mistakes.length > 0 || data.pronunciationIssues.length > 0) && (
                  <View style={styles.transcriptLegend}>
                    {data.mistakes.length > 0 && (
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: theme.colors.error + "40" }]} />
                        <Text style={styles.legendText}>Grammar</Text>
                      </View>
                    )}
                    {data.pronunciationIssues.length > 0 && (
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: theme.colors.warning + "50" }]} />
                        <Text style={styles.legendText}>Pronunciation</Text>
                      </View>
                    )}
                  </View>
                )}
                <View style={[styles.transcriptCard, { marginHorizontal: 0 }]}>
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                    style={styles.transcriptScroll}
                  >
                    <TranscriptWithHighlights
                      transcript={
                        sessionData?.feedback?.transcript ??
                        sessionData?.summaryJson?.transcript ??
                        ""
                      }
                      mistakes={data.mistakes}
                      pronunciationIssues={data.pronunciationIssues}
                      participants={sessionData?.participants}
                    />
                  </ScrollView>
                </View>
              </>
            )}
          </Animated.View>
        )}
        </View>

        {/* Detail Toggle */}
        <TouchableOpacity
          style={styles.detailToggleCard}
          onPress={() => setShowDetailedAnalysis(!showDetailedAnalysis)}
          activeOpacity={0.85}
        >
          <View style={styles.detailToggleRow}>
            <View style={styles.detailToggleTextCol}>
              <Text style={styles.detailToggleTitle}>
                {showDetailedAnalysis ? "Hide deep dive" : "Show deep dive"}
              </Text>
              <Text style={styles.detailToggleHint}>
                Word-level scores, grammar, vocabulary, and practice tips
              </Text>
            </View>
            <Ionicons
              name={showDetailedAnalysis ? "chevron-up" : "chevron-down"}
              size={22}
              color={theme.colors.primary}
            />
          </View>
        </TouchableOpacity>

        {/* Dev-only: re-run pronunciation for past sessions */}
        {__DEV__ && !!sessionId && sessionId !== "session-id" && (
          <TouchableOpacity
            style={[styles.detailToggleDev, { marginTop: 10 }]}
            onPress={async () => {
              try {
                setCheckingAgain(true);
                await sessionsApi.rerunPronunciation(sessionId);
                // force refresh
                const fresh = await sessionsApi.getSessionAnalysis(sessionId);
                setSessionData(fresh);
                setPronPollCount(0);
              } catch (e) {
                console.warn("rerunPronunciation failed", e);
              } finally {
                setCheckingAgain(false);
              }
            }}
          >
            <Text style={styles.detailToggleText}>
              {checkingAgain ? "⏳ Re-running pronunciation..." : "🔁 Re-run pronunciation (dev)"}
            </Text>
          </TouchableOpacity>
        )}

        {showDetailedAnalysis && (
          <Animated.View entering={FadeInDown.delay(350).springify()}>
            {/* Word Level Breakdown */}
            {data.wordLevelData && data.wordLevelData.length > 0 && (
              <WordLevelBreakdown wordScores={data.wordLevelData} />
            )}

            {/* Grammar & Vocabulary Breakdown */}
            {(data.aiFeedback?.grammar || data.aiFeedback?.vocabulary) && (
              <GrammarVocabBreakdown
                grammar={
                  data.aiFeedback?.grammar || {
                    score: 0,
                    errors: [],
                    strengths: [],
                    cefr_level: "A1",
                    justification: "No grammar analysis available.",
                  }
                }
                vocabulary={
                  data.aiFeedback?.vocabulary || {
                    score: 0,
                    word_count: 0,
                    unique_words: 0,
                    advanced_words: [],
                    repetitions: {},
                    inappropriate_words: {},
                    cefr_level: "A1",
                    justification: "No vocabulary analysis available.",
                  }
                }
              />
            )}

            {/* Actionable Practice Tips */}
            {data.actionableFeedback && (
              <PracticeTips actionableFeedback={data.actionableFeedback} />
            )}
          </Animated.View>
        )}

        <View style={styles.detailSectionBlock}>
        <Text style={styles.detailSectionLabel}>Pronunciation</Text>
        <Text style={styles.detailSectionSubtitle}>
          Patterns, word fixes, and your highlighted transcript
        </Text>

        {/* Dominant Pronunciation Pattern Card */}
        {(() => {
          const issues = (data.pronunciationIssues || []) as any[];
          if (issues.length < 2) return null;

          const byCategory: Record<string, any[]> = {};
          for (const issue of issues) {
            const cat =
              (
                (issue.rule_category ?? issue.ruleCategory ?? issue.issueType ?? "") as string
              ).trim() || "general_mispronunciation";
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(issue);
          }

          const sorted = Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length);
          const top = sorted.find(([, items]) => items.length >= 2);
          if (!top) return null;
          const [cat, catIssues] = top;

          const LABELS: Record<string, string> = {
            th_to_d: "th→d substitution",
            th_to_t: "th→t substitution",
            v_to_w: "v→w substitution",
            w_to_v: "w→v substitution",
            h_dropping: "h-dropping",
            ae_to_e: "vowel ae→e",
            i_to_ee: "vowel i→ee",
            retroflex_substitution: "retroflex consonants",
            vowel_shift: "vowel shift",
            general_mispronunciation: "mispronunciation",
            syllable_compression: "syllable compression",
            final_cluster_reduction: "final consonant reduction",
            consonant_cluster_simplification: "cluster simplification",
            unknown_substitution: "unknown substitution",
          };

          const TIPS: Record<string, string> = {
            th_to_d: "Put your tongue between your teeth for 'th' sounds.",
            th_to_t: "Put your tongue between your teeth for 'th' sounds.",
            v_to_w: "Bite your lower lip lightly for 'v' sounds.",
            w_to_v: "Round your lips fully for 'w' — no teeth contact.",
            h_dropping: "Push a breath of air out before starting 'h' words.",
            ae_to_e: "Open your mouth wider for the 'a' sound, like in 'cat'.",
            i_to_ee: "Relax your lips — don't stretch them for the short 'i' in 'bit'.",
            retroflex_substitution: "Keep your tongue tip at the gum ridge, not curled back.",
            vowel_shift: "Open your mouth more on stressed vowels.",
            general_mispronunciation: "Slow the word down and say each syllable separately.",
            syllable_compression: "Say every syllable — do not skip any.",
            final_cluster_reduction: "Finish the final consonant fully before stopping.",
            consonant_cluster_simplification: "Say both consonants at the start of the word.",
            unknown_substitution: "Listen to the word carefully and repeat it slowly three times.",
          };

          const label = LABELS[cat] ?? cat.replace(/_/g, " ");
          const tip = TIPS[cat] ?? "Focus on each syllable carefully.";

          const example = catIssues.find((i) => {
            const spoken = ((i.spoken ?? "") as string).trim();
            const correct = ((i.correct ?? i.word ?? "") as string).trim();
            return spoken && correct && spoken !== correct && spoken !== "—" && correct !== "—";
          });
          const spokenWord = example ? ((example.spoken ?? "") as string).trim() : null;
          const correctWord = example
            ? ((example.correct ?? example.word ?? "") as string).trim()
            : null;

          return (
            <Animated.View entering={FadeInDown.delay(350).springify()}>
              <View style={styles.dominantPatternCard}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <Ionicons
                    name="mic"
                    size={16}
                    color={theme.colors.primary}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.dominantPatternKicker}>
                    Dominant pattern · {catIssues.length}×
                  </Text>
                </View>
                <Text style={styles.dominantPatternLabel}>{label}</Text>
                {spokenWord && correctWord && (
                  <Text style={styles.dominantPatternExample}>
                    {"You said "}
                    <Text style={{ color: theme.colors.error, fontWeight: "600" }}>
                      "{spokenWord}"
                    </Text>
                    {" — correct: "}
                    <Text style={{ color: theme.colors.success, fontWeight: "600" }}>
                      "{correctWord}"
                    </Text>
                  </Text>
                )}
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <Ionicons
                    name="information-circle-outline"
                    size={14}
                    color={theme.colors.primary}
                    style={{ marginRight: 4, marginTop: 1 }}
                  />
                  <Text style={styles.dominantPatternTip}>{tip}</Text>
                </View>
              </View>
            </Animated.View>
          );
        })()}

        {/* Pronunciation 3-tab component (replaces Words + Accent sections). */}
        {(() => {
          const rawIssues = data.pronunciationIssues || [];
          const normalized: PronIssueNormalized[] = rawIssues.map((it: any, idx: number) => {
            const parsed = parsePronunciationIssue(it);
            return {
              id: String(it.id ?? `${idx}`),
              correct: (it.correct ?? parsed.correctWord ?? it.word ?? "").trim() || "—",
              spoken: (it.spoken ?? parsed.spokenWord ?? it.word ?? "").trim() || "—",
              rule_category: (it.rule_category ?? it.ruleCategory ?? it.issueType ?? "").trim() || "general_mispronunciation",
              confidence: it.confidence != null ? Number(it.confidence) : undefined,
              word_index: typeof it.word_index === "number" ? it.word_index : undefined,
              suggestion: it.suggestion,
              reel_id: it.reelId ?? it.reel_id ?? undefined,
            };
          });

          // While the pipeline is still finishing, show the tabs with zero issues and transcript.
          const shouldShow =
            normalized.length > 0 ||
            (!!sessionData?.analyses?.length && pronPollCount < MAX_PRON_POLLS) ||
            !!(sessionData?.feedback?.transcript ?? sessionData?.summaryJson?.transcript);
          if (!shouldShow) return null;

          return (
            <PronunciationTabs
              issues={normalized}
              transcript={
                sessionData?.feedback?.transcript ??
                sessionData?.summaryJson?.transcript ??
                ""
              }
              onPractice={(ruleCategory, reelId) =>
                navigation
                  .getParent()
                  ?.navigate("MainTabs", { screen: "eBites", params: reelId ? { reelId } : { ruleCategory } })
              }
              firstName={user?.firstName ?? undefined}
              enteringDelay={400}
              embedded
            />
          );
        })()}
        </View>

        {/* Strengths & Areas to Improve */}
        {(data.strengths.length > 0 || data.improvementAreas.length > 0) && (
          <Animated.View entering={FadeInDown.delay(800).springify()} style={styles.detailSectionBlock}>
            <Text style={styles.detailSectionLabel}>Performance</Text>
            <Text style={styles.detailSectionSubtitle}>
              What went well and what to focus on next
            </Text>
            <View style={styles.strengthsRow}>
              {data.strengths.length > 0 && (
                <View
                  style={[
                    styles.strengthCard,
                    { borderLeftColor: theme.colors.success },
                  ]}
                >
                  <View style={styles.strengthHeader}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={theme.colors.success}
                    />
                    <Text
                      style={[
                        styles.strengthTitle,
                        { color: theme.colors.success },
                      ]}
                    >
                      Strengths
                    </Text>
                  </View>
                  {data.strengths.map((s, i) => (
                    <Text key={i} style={styles.strengthItem}>
                      • {s}
                    </Text>
                  ))}
                </View>
              )}
              {data.improvementAreas.length > 0 && (
                <View
                  style={[
                    styles.strengthCard,
                    { borderLeftColor: theme.colors.warning },
                  ]}
                >
                  <View style={styles.strengthHeader}>
                    <Ionicons
                      name="trending-up"
                      size={16}
                      color={theme.colors.warning}
                    />
                    <Text
                      style={[
                        styles.strengthTitle,
                        { color: theme.colors.warning },
                      ]}
                    >
                      Improve
                    </Text>
                  </View>
                  {data.improvementAreas.map((a, i) => (
                    <Text key={i} style={styles.strengthItem}>
                      • {a}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          </Animated.View>
        )}

        <View style={styles.detailSectionBlock}>
        <Text style={styles.detailSectionLabel}>
          Grammar corrections{data.mistakes.length > 0 ? ` (${data.mistakes.length})` : ""}
        </Text>
        <Text style={styles.detailSectionSubtitle}>
          {data.mistakes.length > 0
            ? "Tap a card to expand — highlights in the conversation match these fixes"
            : "No major grammar issues detected this session"}
        </Text>
        {data.mistakes.length > 0 ? (
          data.mistakes.map((item, index) => (
            <MistakeCard key={item.id || index} item={item} index={index} />
          ))
        ) : (
          <View style={styles.glassCard}>
            <View style={{ alignItems: "center", paddingVertical: 12 }}>
              <Ionicons
                name="checkmark-circle"
                size={32}
                color={theme.colors.success}
              />
              <Text
                style={{
                  color: theme.colors.text.secondary,
                  fontSize: 14,
                  marginTop: 8,
                }}
              >
                No significant mistakes found. Keep it up!
              </Text>
            </View>
          </View>
        )}
        </View>

        {/* MAYA AI Summary – engaging, human copy + real data */}
        {mayaHasContent && (
          <Animated.View entering={FadeInDown.delay(1000).springify()} style={styles.detailSectionBlock}>
            <Text style={styles.detailSectionLabel}>Coach insight</Text>
            <Text style={styles.detailSectionSubtitle}>
              Personalized takeaways from MAYA for this call
            </Text>
            <LinearGradient
              colors={[
                theme.colors.primary + "12",
                theme.colors.primary + "06",
                "transparent",
              ]}
              style={styles.mayaCard}
            >
              <View style={styles.mayaCardInner}>
                <View style={styles.mayaHeader}>
                  <LinearGradient
                    colors={theme.colors.gradients.primary}
                    style={styles.mayaIcon}
                  >
                    <Ionicons name="sparkles" size={20} color="white" />
                  </LinearGradient>
                  <View style={styles.mayaHeaderText}>
                    <Text style={styles.mayaTitle}>MAYA AI</Text>
                    <Text style={styles.mayaSubtitle}>
                      CEFR {data.cefrLevel} • {data.overallScore}% this call
                    </Text>
                  </View>
                </View>

                <Text style={styles.mayaHeadline}>{mayaHeadline}</Text>

                {data.summaryText ? (
                  <View style={styles.mayaNarrativeWrap}>
                    <Text style={styles.mayaSaysLabel}>MAYA says</Text>
                    <Text style={styles.mayaNarrative}>{data.summaryText}</Text>
                  </View>
                ) : null}

                {mayaTopTip ? (
                  <View style={styles.mayaTipWrap}>
                    <Ionicons name="bulb" size={18} color={theme.colors.warning} />
                    <Text style={styles.mayaTipText}>{mayaTopTip}</Text>
                  </View>
                ) : null}

                {weakSpots.length > 0 && (
                  <View style={styles.mayaSection}>
                    <Text style={styles.mayaSectionTag}>Where to level up</Text>
                    <Text style={styles.mayaSectionSub}>
                      A little practice here will go a long way
                    </Text>
                    {weakSpots.map((s) => (
                      <View key={s.key} style={styles.mayaWeakRow}>
                        <View style={styles.mayaWeakLabel}>
                          <Ionicons name={s.icon as any} size={16} color={theme.colors.primary} />
                          <Text style={styles.mayaWeakName}>{s.key}</Text>
                        </View>
                        <View style={styles.mayaWeakBarBg}>
                          <View
                            style={[
                              styles.mayaWeakBarFill,
                              {
                                width: `${Math.min(100, s.score)}%`,
                                backgroundColor: getScoreColor(s.score, theme),
                              },
                            ]}
                          />
                        </View>
                        <Text style={[styles.mayaWeakScore, { color: getScoreColor(s.score, theme) }]}>
                          {s.score}%
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {wordsToLearn.length > 0 && (
                  <View style={styles.mayaSection}>
                    <Text style={styles.mayaSectionTag}>Try these next time</Text>
                    <Text style={styles.mayaSectionSub}>
                      Phrases that'll make you sound sharper
                    </Text>
                    <View style={styles.mayaWordsWrap}>
                      {wordsToLearn.slice(0, 8).map((word, i) => (
                        <View key={`${word}-${i}`} style={styles.mayaWordPill}>
                          <Text style={styles.mayaWordPillText} numberOfLines={1}>
                            {String(word).trim()}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {(data.mistakes.length > 0 ||
                  (data.strengths?.length ?? 0) > 0 ||
                  data.improvementAreas.length > 0) && (
                  <View style={styles.mayaQuickStats}>
                    {data.mistakes.length > 0 && (
                      <View style={styles.mayaStat}>
                        <Text style={styles.mayaStatValue}>{data.mistakes.length}</Text>
                        <Text style={styles.mayaStatLabel}>to polish</Text>
                      </View>
                    )}
                    {(data.strengths?.length ?? 0) > 0 && (
                      <View style={styles.mayaStat}>
                        <Text style={[styles.mayaStatValue, { color: theme.colors.success }]}>
                          {data.strengths.length}
                        </Text>
                        <Text style={styles.mayaStatLabel}>you did well</Text>
                      </View>
                    )}
                    {data.improvementAreas.length > 0 && (
                      <View style={styles.mayaStat}>
                        <Text style={[styles.mayaStatValue, { color: theme.colors.warning }]}>
                          {data.improvementAreas.length}
                        </Text>
                        <Text style={styles.mayaStatLabel}>to grow</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        {/* Action Buttons */}
        <Animated.View
          entering={FadeInDown.delay(1100).springify()}
          style={styles.actions}
        >
          <TouchableOpacity
            style={styles.primaryAction}
            activeOpacity={0.8}
            onPress={() => navigation.navigate("Call")}
          >
            <LinearGradient
              colors={theme.colors.gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.actionGradient}
            >
              <Ionicons name="call" size={20} color="white" />
              <Text style={styles.primaryActionText}>Practice Again</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryAction}
            activeOpacity={0.7}
            onPress={() => navigation.navigate("MainTabs")}
          >
            <Ionicons
              name="home-outline"
              size={20}
              color={theme.colors.primary}
            />
            <Text style={styles.secondaryActionText}>Back to Home</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={{ height: 120 }} />
      </ScrollView>
      <CoachingCallSummaryToast
        message={coachingSummaryMessage}
        phrases={coachingSummaryPhrases}
        onDismiss={() => setCoachingSummaryMessage(null)}
      />
    </SafeAreaView>
  );
}

const getStyles = (theme: any) => {
  // Dark themes (EngR/Englivo) use light text — hardcoded white "glass" made text invisible.
  const glassBg = `${String(theme.colors.surface)}E8`;
  const glassBorder = theme.colors.border;
  const cardSolid = theme.colors.surface;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      paddingBottom: theme.spacing.xl,
      gap: 0,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.s,
    },
    headerGradient: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.m,
      paddingBottom: theme.spacing.s,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border + "20",
      backgroundColor: "transparent",
      ...theme.shadows.small,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
    },
    backChip: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.colors.primary + "12",
      borderWidth: 1,
      borderColor: theme.colors.primary + "30",
    },
    backChipSpacer: {
      width: 40,
      height: 40,
    },
    ebitesRecommendCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#7C3AED10",
      borderWidth: 1,
      borderColor: "#7C3AED30",
      borderRadius: theme.borderRadius.m,
      padding: theme.spacing.s,
      marginBottom: theme.spacing.s,
      gap: theme.spacing.s,
    },
    ebitesRecommendIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "#7C3AED15",
      alignItems: "center",
      justifyContent: "center",
    },
    ebitesRecommendTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: "#7C3AED",
      marginBottom: 2,
    },
    ebitesRecommendSub: {
      fontSize: 11,
      color: theme.colors.text.secondary,
      lineHeight: 15,
    },
    listenBtnWrapper: {
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 0,
    },
    listenBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.borderRadius.l,
      paddingVertical: 14,
      overflow: "hidden",
      ...theme.shadows.primaryGlow,
    },
    listenBtnPlaying: {
      // tint handled via gradient colors above
    },
    listenBtnText: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "700",
    },
    subtitleBox: {
      marginHorizontal: 0,
      marginTop: 8,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
    },
    subtitleText: {
      color: 'rgba(255,255,255,0.88)',
      fontSize: 13,
      lineHeight: 20,
    },
    subtitleWord: {
      color: 'rgba(255,255,255,0.55)',
      fontSize: 13,
      lineHeight: 20,
    },
    subtitleWordActive: {
      color: '#ffffff',
      fontWeight: '700',
    },
    transcriptToggleRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      marginBottom: 8,
    },
    headerTitle: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    headerSubtitle: {
      marginTop: 2,
      fontSize: theme.typography.sizes.s,
      fontWeight: "600",
      color: theme.colors.text.secondary,
      lineHeight: 18,
    },
    headerCenter: {
      flex: 1,
      paddingHorizontal: theme.spacing.s,
    },
    metaRow: {
      flexDirection: "row",
      paddingHorizontal: 0,
      gap: theme.spacing.s,
      marginBottom: theme.spacing.m,
      flexWrap: "wrap",
    },
    metaPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: theme.borderRadius.circle,
      backgroundColor: glassBg,
      borderWidth: 1,
      borderColor: glassBorder,
    },
    metaText: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.secondary,
      fontWeight: "500",
    },
    capBanner: {
      marginHorizontal: 0,
      marginBottom: theme.spacing.m,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.primary + "18",
      borderWidth: 1,
      borderColor: theme.colors.primary + "40",
      overflow: "hidden",
    },
    capBannerContent: {
      padding: theme.spacing.m,
    },
    capBannerTitle: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "700",
      color: theme.colors.text.primary,
      marginBottom: 4,
    },
    capBannerSubtitle: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.secondary,
      marginBottom: theme.spacing.s,
    },
    capBannerCta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: theme.colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: theme.borderRadius.md,
      alignSelf: "flex-start",
    },
    capBannerCtaText: {
      fontSize: theme.typography.sizes.s,
      fontWeight: "600",
      color: "#fff",
    },
    scoreCard: {
      marginHorizontal: 0,
      marginBottom: theme.spacing.l,
      borderRadius: theme.borderRadius.xl,
      ...theme.shadows.medium,
    },
    scoreGradient: {
      borderRadius: theme.borderRadius.xl,
      paddingVertical: theme.spacing.xl,
      alignItems: "center",
    },
    scoreLabel: {
      color: "rgba(255,255,255,0.8)",
      fontSize: theme.typography.sizes.m,
      fontWeight: "500",
      marginBottom: theme.spacing.s,
    },
    scoreRow: {
      flexDirection: "row",
      alignItems: "baseline",
    },
    scoreValue: {
      color: "white",
      fontSize: 64,
      fontWeight: "bold",
    },
    scoreMax: {
      color: "rgba(255,255,255,0.6)",
      fontSize: theme.typography.sizes.xl,
      fontWeight: "500",
      marginLeft: 4,
    },
    levelChip: {
      marginTop: theme.spacing.m,
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.borderRadius.circle,
    },
    levelChipText: {
      color: "white",
      fontSize: theme.typography.sizes.m,
      fontWeight: "700",
    },
    whatItMeansWrap: {
      marginHorizontal: 0,
      marginBottom: theme.spacing.m,
      borderRadius: theme.borderRadius.xl,
      overflow: "hidden",
      borderWidth: 1,
      borderColor:
        typeof theme.colors.border === "string"
          ? `${theme.colors.border}90`
          : theme.colors.border,
      ...theme.shadows.medium,
    },
    whatItMeansGradient: {
      position: "relative",
    },
    whatItMeansAccentBar: {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
      borderTopLeftRadius: theme.borderRadius.xl,
      borderBottomLeftRadius: theme.borderRadius.xl,
    },
    whatItMeansInner: {
      padding: theme.spacing.m,
      paddingLeft: theme.spacing.m + 8,
    },
    whatItMeansHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: theme.spacing.s,
      gap: theme.spacing.s,
    },
    whatItMeansIconBadge: {
      width: 44,
      height: 44,
      borderRadius: theme.borderRadius.m,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
    },
    whatItMeansHeaderText: {
      flex: 1,
      minWidth: 0,
    },
    whatItMeansKicker: {
      fontSize: theme.typography.sizes.xs,
      fontWeight: "700",
      color: theme.colors.text.secondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 2,
    },
    whatItMeansTitle: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "800",
      color: theme.colors.text.primary,
      letterSpacing: -0.2,
    },
    whatItMeansCefrPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: theme.borderRadius.circle,
      borderWidth: 1,
    },
    whatItMeansCefrText: {
      fontSize: theme.typography.sizes.s,
      fontWeight: "800",
    },
    whatItMeansText: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.secondary,
      lineHeight: 22,
    },
    sectionTitle: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "bold",
      color: theme.colors.text.primary,
      paddingHorizontal: theme.spacing.l,
      marginBottom: theme.spacing.m,
      marginTop: theme.spacing.m,
    },
    transcriptToggleLabel: {
      fontSize: theme.typography.sizes.s,
      fontWeight: "600",
      color: theme.colors.text.secondary,
    },
    dominantPatternCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: theme.spacing.m,
      marginHorizontal: 0,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.primary,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.shadows.small,
    },
    dominantPatternKicker: {
      color: theme.colors.primary,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    dominantPatternLabel: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 4,
    },
    dominantPatternExample: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      marginBottom: 8,
      lineHeight: 20,
    },
    dominantPatternTip: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      flex: 1,
      lineHeight: 18,
    },
    detailSectionBlock: {
      marginTop: theme.spacing.xl,
      marginBottom: theme.spacing.s,
      gap: theme.spacing.m,
      paddingHorizontal: theme.spacing.l,
      paddingVertical: theme.spacing.s,
      borderRadius: 18,
      backgroundColor: `${String(theme.colors.surface)}88`,
      borderWidth: 1,
      borderColor: `${String(theme.colors.border)}88`,
    },
    detailSectionLabel: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "800",
      color: theme.colors.text.primary,
      marginBottom: theme.spacing.s,
      letterSpacing: 0.2,
    },
    detailSectionSubtitle: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.secondary,
      lineHeight: 20,
      marginBottom: theme.spacing.s,
      marginTop: 0,
    },
    helpfulRow: {
      marginTop: -4,
      marginBottom: theme.spacing.s,
      gap: 8,
    },
    helpfulPrompt: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.light,
      fontWeight: "600",
    },
    helpfulButtons: {
      flexDirection: "row",
      gap: 10,
    },
    helpfulBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: `${String(theme.colors.border)}AA`,
      backgroundColor: `${String(theme.colors.surface)}CC`,
    },
    helpfulBtnText: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.secondary,
      fontWeight: "700",
    },
    wordsToWorkOnSubtitle: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.secondary,
      paddingHorizontal: theme.spacing.l,
      marginBottom: theme.spacing.s,
      lineHeight: 20,
    },
    pronunciationIssueRow: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    pronunciationIssueHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    pronunciationIssueWord: {
      flex: 1,
      marginRight: 8,
    },
    pronunciationIssueWordText: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "600",
      color: theme.colors.text.primary,
    },
    phoneticText: {
      fontSize: theme.typography.sizes.xs,
      color: "#ef4444",
      marginTop: 3,
      fontStyle: "italic",
    },
    pronunciationIssueBadgeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    severityBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    severityBadgeText: {
      fontSize: 11,
      fontWeight: "600",
    },
    accuracyText: {
      fontSize: 12,
      fontWeight: "700",
    },
    pronunciationIssueSuggestion: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.secondary,
      marginTop: 6,
      lineHeight: 18,
    },
    dominantErrorsWrap: {
      marginTop: theme.spacing.s,
      paddingTop: theme.spacing.s,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    dominantErrorsLabel: {
      fontSize: theme.typography.sizes.xs,
      fontWeight: "600",
      color: theme.colors.text.secondary,
      marginBottom: 4,
    },
    dominantErrorsText: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.primary,
      lineHeight: 20,
    },
    // Glassmorphism card used for all sections
    glassCard: {
      backgroundColor: glassBg,
      marginHorizontal: 0,
      borderRadius: 16,
      padding: theme.spacing.m,
      gap: theme.spacing.m,
      borderWidth: 1,
      borderColor: glassBorder,
      ...theme.shadows.medium,
    },
    transcriptSection: {
      marginBottom: 0,
      paddingHorizontal: 0,
    },
    transcriptCard: {
      backgroundColor: glassBg,
      marginHorizontal: 0,
      borderRadius: 16,
      padding: theme.spacing.m,
      borderWidth: 1,
      borderColor: glassBorder,
      ...theme.shadows.medium,
      maxHeight: 240,
    },
    transcriptScroll: {
      maxHeight: 220,
    },
    transcriptText: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.secondary,
      lineHeight: 22,
    },
    transcriptHighlight: {
      backgroundColor: theme.colors.error + "25",
      color: theme.colors.error,
      textDecorationLine: "underline",
    },
    transcriptPronunciationHighlight: {
      backgroundColor: theme.colors.warning + "30",
      color: theme.colors.warning,
      textDecorationLine: "underline",
      textDecorationStyle: "dotted" as const,
    },
    transcriptLegend: {
      flexDirection: "row" as const,
      paddingHorizontal: 0,
      marginBottom: theme.spacing.s,
      gap: 16,
    },
    legendItem: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
    },
    legendDot: {
      width: 12,
      height: 12,
      borderRadius: 3,
    },
    legendText: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.secondary,
      fontWeight: "500" as const,
    },
    chatBubbleWrap: {
      gap: 2,
    },
    chatSpeaker: {
      fontSize: 11,
      fontWeight: "700" as const,
      letterSpacing: 0.3,
      textTransform: "uppercase" as const,
    },
    chatBubble: {
      borderLeftWidth: 3,
      paddingLeft: 10,
      paddingVertical: 2,
    },
    transcriptHint: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.primary,
      fontWeight: "600",
      paddingHorizontal: theme.spacing.l,
      marginBottom: theme.spacing.s,
    },
    keyMistakesHint: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.secondary,
      marginBottom: theme.spacing.s,
      lineHeight: 18,
    },
    skillRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.s,
    },
    skillInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      width: 130,
    },
    skillIcon: {
      width: 28,
      height: 28,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    skillLabel: {
      fontSize: theme.typography.sizes.s,
      fontWeight: "500",
      color: theme.colors.text.primary,
    },
    barContainer: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.border,
      overflow: "hidden",
    },
    barFill: {
      height: "100%",
      borderRadius: 4,
    },
    skillScore: {
      fontSize: theme.typography.sizes.s,
      fontWeight: "700",
      width: 40,
      textAlign: "right",
    },
    // Accent section
    accentHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    accentIconContainer: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: theme.colors.primary + "15",
      justifyContent: "center",
      alignItems: "center",
    },
    accentTitle: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    accentText: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.secondary,
      lineHeight: 22,
    },
    tipRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      backgroundColor: theme.colors.warning + "08",
      padding: theme.spacing.s,
      borderRadius: 10,
    },
    tipText: {
      flex: 1,
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.secondary,
      lineHeight: 18,
    },
    // Pronunciation tabs
    pronTabsBar: {
      marginHorizontal: theme.spacing.l,
      flexDirection: "row",
      gap: 10,
      marginBottom: theme.spacing.s,
    },
    pronTabPill: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
    },
    pronTabPillActive: {
      backgroundColor: theme.colors.info + "10",
      borderColor: theme.colors.info + "40",
    },
    pronTabPillInactive: {
      backgroundColor: "transparent",
      borderColor: glassBorder,
    },
    pronTabText: {
      fontSize: theme.typography.sizes.xs,
      fontWeight: "700",
    },
    pronTabTextActive: {
      color: theme.colors.info,
    },
    pronTabTextInactive: {
      color: theme.colors.text.secondary,
    },
    pronTabsBody: {
      marginHorizontal: theme.spacing.l,
      backgroundColor: glassBg,
      borderRadius: 16,
      padding: theme.spacing.m,
      borderWidth: 1,
      borderColor: glassBorder,
      ...theme.shadows.medium,
      marginBottom: theme.spacing.m,
    },
    pronIssueCard: {
      backgroundColor: cardSolid,
      borderRadius: 14,
      borderWidth: 0.5,
      borderColor: glassBorder,
      overflow: "hidden",
    },
    pronIssueTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
    },
    pronIssueAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    pronIssueAvatarText: {
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    pronIssueWordRow: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    pronIssueCorrect: {
      color: theme.colors.text.primary,
    },
    pronIssueArrow: {
      color: theme.colors.text.secondary,
    },
    pronIssueSpoken: {
      fontWeight: "800",
    },
    pronIssueMeta: {
      marginTop: 2,
      fontSize: 12,
      color: theme.colors.text.secondary,
    },
    pronIssueExpanded: {
      paddingHorizontal: 12,
      paddingBottom: 12,
      gap: 10,
    },
    pronIssueFix: {
      fontSize: 13,
      color: theme.colors.text.secondary,
      lineHeight: 18,
    },
    pronPracticeBtn: {
      alignSelf: "flex-start",
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
    },
    pronPracticeBtnText: {
      color: "#fff",
      fontSize: 13,
      fontWeight: "800",
    },
    pronTranscriptWrap: {
      backgroundColor: `${String(theme.colors.surface)}99`,
      borderRadius: 14,
      padding: 12,
    },
    pronTranscriptText: {
      fontSize: 14,
      color: theme.colors.text.secondary,
      lineHeight: 22,
    },
    pronChip: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    pronLegend: {
      fontSize: 12,
      color: theme.colors.text.secondary,
    },
    pronLegendDot: {
      fontSize: 12,
    },
    pronPatternRow: {
      backgroundColor: cardSolid,
      borderRadius: 14,
      borderWidth: 0.5,
      borderColor: glassBorder,
      padding: 12,
      gap: 8,
    },
    pronPatternTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: theme.colors.text.primary,
    },
    pronPatternCount: {
      color: theme.colors.text.secondary,
      fontWeight: "700",
    },
    pronPatternBarBg: {
      height: 8,
      borderRadius: 999,
      backgroundColor: "rgba(15, 23, 42, 0.08)",
      overflow: "hidden",
    },
    pronPatternBarFill: {
      height: "100%",
      borderRadius: 999,
    },
    pronSeverityPill: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 999,
    },
    pronSeverityText: {
      fontSize: 11,
      fontWeight: "800",
    },
    pronPlanBtn: {
      marginTop: theme.spacing.s,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: "center",
    },
    pronPlanBtnText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "800",
    },
    emptyTabText: {
      fontSize: 13,
      color: theme.colors.text.secondary,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.35)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    modalCard: {
      width: "100%",
      maxWidth: 420,
      backgroundColor: cardSolid,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: glassBorder,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "900",
      color: theme.colors.text.primary,
      marginBottom: 6,
    },
    modalSub: {
      fontSize: 13,
      color: theme.colors.text.secondary,
      marginBottom: 10,
    },
    modalFix: {
      fontSize: 13,
      color: theme.colors.text.secondary,
      lineHeight: 18,
      marginBottom: 12,
    },
    modalBtn: {
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: "center",
    },
    modalBtnText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "900",
    },
    // Strengths & Improvements
    strengthsRow: {
      paddingHorizontal: 0,
      gap: theme.spacing.m,
    },
    strengthCard: {
      backgroundColor: glassBg,
      borderRadius: 16,
      padding: theme.spacing.m,
      borderWidth: 1,
      borderColor: glassBorder,
      borderLeftWidth: 3,
      ...theme.shadows.medium,
    },
    strengthHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },
    strengthTitle: {
      fontSize: theme.typography.sizes.s,
      fontWeight: "700",
    },
    strengthItem: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.secondary,
      lineHeight: 22,
      paddingLeft: 4,
    },
    // Mistake cards
    mistakeCard: {
      backgroundColor: glassBg,
      marginHorizontal: 0,
      marginBottom: theme.spacing.s,
      borderRadius: 16,
      padding: theme.spacing.m,
      borderWidth: 1,
      borderColor: glassBorder,
      ...theme.shadows.medium,
    },
    mistakeHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme.spacing.s,
    },
    mistakeTypeRow: {
      flexDirection: "row",
      gap: theme.spacing.s,
      alignItems: "center",
    },
    mistakeTypePill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: theme.borderRadius.circle,
      backgroundColor: theme.colors.primary + "12",
    },
    mistakeTypeText: {
      fontSize: 11,
      fontWeight: "600",
      color: theme.colors.primary,
    },
    severityText: {
      fontSize: 11,
      fontWeight: "600",
    },
    mistakeContent: {
      gap: 10,
    },
    mistakeLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: theme.colors.text.secondary,
      marginBottom: 2,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    mistakeLine: {
      gap: 2,
    },
    mistakeLineInner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    mistakeDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginTop: 7,
    },
    originalText: {
      flex: 1,
      fontSize: theme.typography.sizes.s,
      color: `${String(theme.colors.error)}`,
      fontWeight: "600",
      lineHeight: 20,
    },
    correctedText: {
      flex: 1,
      fontSize: theme.typography.sizes.s,
      color: `${String(theme.colors.success)}`,
      fontWeight: "700",
      lineHeight: 20,
    },
    explanationContainer: {
      flexDirection: "row",
      gap: 8,
      marginTop: theme.spacing.m,
      paddingTop: theme.spacing.s,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      alignItems: "flex-start",
    },
    explanationText: {
      flex: 1,
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.secondary,
      lineHeight: 18,
    },
    exampleContainer: {
      marginTop: theme.spacing.s,
      paddingTop: theme.spacing.s,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      gap: 4,
    },
    exampleLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: theme.colors.primary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    exampleText: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.secondary,
      lineHeight: 18,
      fontStyle: "italic",
    },
    // MAYA AI Summary
    mayaCard: {
      marginHorizontal: theme.spacing.l,
      borderRadius: 24,
      overflow: "hidden",
      ...theme.shadows.medium,
    },
    mayaCardInner: {
      padding: theme.spacing.m,
      borderRadius: 24,
      backgroundColor: glassBg,
      borderWidth: 1,
      borderColor: glassBorder,
    },
    mayaHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: theme.spacing.s,
    },
    mayaIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
    },
    mayaHeaderText: {
      flex: 1,
    },
    mayaTitle: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "800",
      color: theme.colors.text.primary,
    },
    mayaSubtitle: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.secondary,
      marginTop: 2,
    },
    mayaHeadline: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "700",
      color: theme.colors.text.primary,
      lineHeight: 24,
      marginBottom: theme.spacing.m,
    },
    mayaNarrativeWrap: {
      marginBottom: theme.spacing.m,
      padding: theme.spacing.m,
      backgroundColor: theme.colors.primary + "10",
      borderRadius: 16,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.primary,
    },
    mayaSaysLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: theme.colors.primary,
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    mayaNarrative: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.primary,
      lineHeight: 22,
    },
    mayaTipWrap: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      marginBottom: theme.spacing.m,
      padding: theme.spacing.s,
      backgroundColor: theme.colors.warning + "18",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.warning + "40",
    },
    mayaTipText: {
      flex: 1,
      fontSize: theme.typography.sizes.s,
      fontWeight: "600",
      color: theme.colors.text.primary,
      lineHeight: 20,
    },
    mayaSection: {
      marginBottom: theme.spacing.m,
    },
    mayaSectionTag: {
      fontSize: theme.typography.sizes.s,
      fontWeight: "800",
      color: theme.colors.text.primary,
      marginBottom: 2,
    },
    mayaSectionSub: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.secondary,
      marginBottom: 10,
    },
    mayaSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    mayaSectionTitle: {
      fontSize: theme.typography.sizes.s,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    mayaWeakRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 8,
    },
    mayaWeakLabel: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      width: 120,
    },
    mayaWeakName: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.primary,
      fontWeight: "500",
    },
    mayaWeakBarBg: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.border + "80",
      overflow: "hidden",
    },
    mayaWeakBarFill: {
      height: "100%",
      borderRadius: 4,
    },
    mayaWeakScore: {
      fontSize: theme.typography.sizes.s,
      fontWeight: "700",
      minWidth: 36,
      textAlign: "right",
    },
    mayaWordsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    mayaWordPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: theme.colors.primary + "18",
      borderWidth: 1,
      borderColor: theme.colors.primary + "40",
    },
    mayaWordPillText: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.primary,
      fontWeight: "500",
      maxWidth: 140,
    },
    mayaQuickStats: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.l,
      paddingTop: theme.spacing.s,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    mayaStat: {
      alignItems: "center",
      minWidth: 80,
    },
    mayaStatValue: {
      fontSize: 20,
      fontWeight: "800",
      color: theme.colors.primary,
    },
    mayaStatLabel: {
      fontSize: 11,
      color: theme.colors.text.secondary,
      marginTop: 2,
    },
    // Legacy AI Summary (kept for any refs)
    summaryHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    aiIcon: {
      width: 28,
      height: 28,
      borderRadius: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    aiLabel: {
      fontSize: theme.typography.sizes.s,
      fontWeight: "700",
      color: theme.colors.text.primary,
    },
    summaryText: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.secondary,
      lineHeight: 22,
    },
    // Actions
    actions: {
      paddingHorizontal: theme.spacing.l,
      marginTop: theme.spacing.l,
      gap: theme.spacing.m,
    },
    primaryAction: {
      borderRadius: theme.borderRadius.l,
      overflow: "hidden",
      ...theme.shadows.primaryGlow,
    },
    actionGradient: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.spacing.m,
      gap: theme.spacing.s,
    },
    primaryActionText: {
      color: "white",
      fontSize: theme.typography.sizes.m,
      fontWeight: "bold",
    },
    secondaryAction: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.spacing.m,
      borderRadius: theme.borderRadius.l,
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
      gap: theme.spacing.s,
    },
    secondaryActionText: {
      color: theme.colors.primary,
      fontSize: theme.typography.sizes.m,
      fontWeight: "600",
    },
    detailToggleDev: {
      alignSelf: "center",
      paddingVertical: 12,
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    detailToggleCard: {
      marginHorizontal: theme.spacing.l,
      marginTop: theme.spacing.m,
      marginBottom: theme.spacing.s,
      paddingVertical: theme.spacing.m,
      paddingHorizontal: theme.spacing.m,
      borderRadius: theme.borderRadius.l,
      borderWidth: 1,
      borderColor: theme.colors.primary + "35",
      backgroundColor: theme.colors.primary + "08",
    },
    detailToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.m,
    },
    detailToggleTextCol: {
      flex: 1,
    },
    detailToggleTitle: {
      color: theme.colors.text.primary,
      fontSize: theme.typography.sizes.m,
      fontWeight: "700",
      marginBottom: 4,
    },
    detailToggleHint: {
      color: theme.colors.text.secondary,
      fontSize: theme.typography.sizes.xs,
      lineHeight: 18,
    },
    detailToggleText: {
      color: theme.colors.primary,
      fontSize: theme.typography.sizes.s,
      fontWeight: "600",
    },
  });
};
