import React, { useState, useEffect, useRef, useCallback } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { fetchFeedbackNarration } from "../../../api/tts";
import type { FeedbackSection } from "../../../api/tts";
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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeInRight } from "react-native-reanimated";
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
import { CallQualityScoreCard } from "../components/CallQualityScoreCard";
import { getCQSScore, CQSResults } from "../../../api/scoring";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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

type PronIssueNormalized = {
  id: string;
  correct: string;
  spoken: string;
  rule_category: string;
  confidence?: number;
  word_index?: number;
  suggestion?: string;
};

function getPronUI(ruleCategory: string) {
  const cat = (ruleCategory || "").trim();
  const vowel =
    cat === "i_to_ee" ||
    cat === "ae_to_e" ||
    cat === "o_to_aa" ||
    cat.includes("vowel");

  if (cat === "th_to_d") return { bg: "#FCEBEB", text: "#A32D2D", key: "TH" };
  if (cat === "th_to_t") return { bg: "#FCEBEB", text: "#A32D2D", key: "TH" };
  if (cat === "v_to_w" || cat === "v_to_b" || cat === "w_to_v" || cat === "v_to_w_reversal")
    return { bg: "#FAEEDA", text: "#633806", key: "VW" };
  if (vowel) return { bg: "#EEEDFE", text: "#3C3489", key: "V" };
  if (cat === "r_rolling") return { bg: "#E1F5EE", text: "#085041", key: "R" };
  return { bg: "#F1F5F9", text: "#475569", key: "PR" };
}

function getPronLabel(ruleCategory: string) {
  const cat = (ruleCategory || "").trim();
  if (cat === "th_to_d" || cat === "th_to_t") return "th sound";
  if (cat === "v_to_b" || cat === "v_to_w" || cat === "w_to_v" || cat === "v_to_w_reversal")
    return "v vs w/b";
  if (cat === "i_to_ee" || cat.includes("vowel")) return "short i vowel";
  if (cat === "r_rolling") return "r sound";
  if (cat === "general_mispronunciation") return "mispronounced";
  return cat ? cat.replace(/_/g, " ") : "pronunciation";
}

function getPronFix(ruleCategory: string) {
  const cat = (ruleCategory || "").trim();
  if (cat === "th_to_d" || cat === "th_to_t")
    return "Place tongue tip lightly between teeth and breathe out.";
  if (cat === "v_to_b" || cat === "v_to_w" || cat === "w_to_v" || cat === "v_to_w_reversal")
    return "Touch upper teeth to lower lip, then vibrate.";
  if (cat === "i_to_ee" || cat.includes("vowel"))
    return "Keep the vowel short and relaxed, don't stretch it.";
  if (cat === "r_rolling") return "Curl tongue back slightly, don't trill.";
  return "Listen to a native speaker and repeat slowly.";
}

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
  enteringDelay = 400,
}: {
  issues: PronIssueNormalized[];
  transcript: string;
  onPractice: (ruleCategory: string) => void;
  enteringDelay?: number;
}) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const [tab, setTab] = useState<"issues" | "transcript" | "patterns">("issues");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalIssue, setModalIssue] = useState<PronIssueNormalized | null>(null);

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
              <Text style={styles.pronIssueArrow}>{"  →  "}</Text>
              <Text style={[styles.pronIssueSpoken, { color: ui.text }]}>{item.spoken}</Text>
            </Text>
            <Text style={styles.pronIssueMeta}>
              {label}
              {acc != null ? ` • ${acc}%` : ""}
            </Text>
          </View>
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
            <TouchableOpacity
              style={[styles.pronPracticeBtn, { backgroundColor: ui.text }]}
              activeOpacity={0.85}
              onPress={() => onPractice(item.rule_category)}
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
      <Text style={styles.sectionTitle}>Pronunciation</Text>
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
  const [playingSection, setPlayingSection] = useState<string | null>(null);
  const [loadingSection, setLoadingSection] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const params = route?.params || {};
  const sessionId = params.sessionId;
  const partnerName = params.partnerName || "Co-learner";
  const topic = params.topic || "General Practice";
  const callDuration = params.duration || 0;

  useEffect(() => {
    let isMounted = true;
    const fetchAnalysis = async () => {
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
          // Keep polling until analysis is ready (was missing: we never re-fetched on PROCESSING)
          if (isMounted && retryCount < 24) {
            setTimeout(() => {
              if (isMounted) setRetryCount((prev) => prev + 1);
            }, 3000); // Poll every 3s while processing so the user who ended first sees feedback sooner
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
            setSessionData(data);
            setLoading(false);
            
            // Also fetch CQS results
            const cqs = await getCQSScore(sessionId);
            setCqsData(cqs);
          }
        } else if (retryCount < 40) {
          // ~2 min total at 3s per poll (both users see feedback sooner)
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
  // (LiveKit egress → transcribe → PA is async and slower). Keep polling
  // for ~90s after initial load to pick up late-arriving pronunciation data.
  useEffect(() => {
    if (loading || !sessionData || !sessionId) return;
    const hasPronIssues =
      (sessionData.analyses?.[0]?.pronunciationIssues?.length ?? 0) > 0;
    const MAX_PRON_POLLS = 18; // 18 * 5s = 90s
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
    }, 5000);

    return () => clearTimeout(timer);
  }, [loading, sessionData, sessionId, pronPollCount]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  if (loading) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <StatusBar barStyle="dark-content" />
        <View style={{ alignItems: "center", gap: 20, paddingHorizontal: 40 }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: theme.colors.text.primary,
              textAlign: "center",
            }}
          >
            {errorHeader}
          </Text>
          <Text
            style={{
              color: theme.colors.text.secondary,
              textAlign: "center",
            }}
          >
            {errorDetail}
          </Text>
          {retryCount > 0 && (
            <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>
              Progress:{" "}
              {Math.min(100, Math.round(((retryCount + 1) / 24) * 100))}%
            </Text>
          )}

          <TouchableOpacity
            style={{ marginTop: 20 }}
            onPress={() => navigation.navigate("MainTabs")}
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
  const hasTranscript =
    typeof sessionData?.feedback?.transcript === "string" &&
    sessionData.feedback.transcript.trim().length > 0;
  const failureTitle =
    sessionData?.status === "ANALYSIS_FAILED" ? errorHeader : "Analysis Unavailable";
  const failureMessage =
    sessionData?.status === "ANALYSIS_FAILED"
      ? errorDetail
      : "We were unable to generate a full analysis for this call. Tap Check again to retry, or go back home.";

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
  };

  // MAYA Summary: derive weak spots (lowest 2 dimensions) and words to learn from real data
  const scoreEntries = [
    { key: "Grammar", score: data.scores.grammar, icon: "document-text" },
    { key: "Pronunciation", score: data.scores.pronunciation, icon: "mic" },
    { key: "Fluency", score: data.scores.fluency, icon: "flash" },
    { key: "Vocabulary", score: data.scores.vocabulary, icon: "book" },
  ] as const;
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
        const pronErrors = (data?.pronunciationIssues ?? []).slice(0, 2).map((p: any) => ({
          spoken: p.spoken ?? p.word,
          correct: p.correct ?? p.word,
          rule_category: p.rule_category ?? p.issueType,
        }));

        const grammarErrors = (data?.mistakes ?? []).slice(0, 2).map((m: any) => ({
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
          pronunciation: data?.aiFeedback?.pronunciation?.justification,
          grammar: data?.aiFeedback?.grammar?.justification,
          vocabulary: data?.aiFeedback?.vocabulary?.justification,
          fluency: data?.aiFeedback?.fluency?.justification,
        };

        const sectionScores: Record<string, number> = {
          pronunciation: data?.scores?.pronunciation ?? 0,
          grammar: data?.scores?.grammar ?? 0,
          vocabulary: data?.scores?.vocabulary ?? 0,
          fluency: data?.scores?.fluency ?? 0,
        };

        const result = await fetchFeedbackNarration({
          section: section as FeedbackSection,
          score: sectionScores[section] ?? 0,
          justification: sectionJustifications[section],
          errors: sectionErrors[section],
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
    [data, playingSection],
  );

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
            onPress={() => navigation.goBack()}
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

        {/* Cap notification banner: pronunciation is holding score back */}
        {(sessionData?.summaryJson?.pronunciation_cefr_cap ||
          (data?.scores?.pronunciation != null &&
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

        {/* Full conversation transcript (grammar + pronunciation highlighted) */}
        {(sessionData?.feedback?.transcript ?? sessionData?.summaryJson?.transcript) && (
          <Animated.View
            entering={FadeInDown.delay(80).springify()}
            style={styles.transcriptSection}
          >
            <Text style={styles.sectionTitle}>Conversation</Text>
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
            <View style={styles.transcriptCard}>
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
          </Animated.View>
        )}

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

        {/* What your score means */}
        <Animated.View
          entering={FadeInDown.delay(220).springify()}
          style={styles.whatItMeansCard}
        >
          <Text style={styles.whatItMeansTitle}>What this score means</Text>
          <Text style={styles.whatItMeansText}>
            {data.overallScore >= 80
              ? `Strong performance (${data.cefrLevel})! You communicated clearly. Focus on the details below to reach the next level.`
              : data.overallScore >= 60
                ? `Good effort (${data.cefrLevel}). You're on the right track. Check the breakdown and word-level feedback below to see exactly where to improve.`
                : `There’s room to grow. Your score reflects grammar, pronunciation, fluency, and vocabulary. Use the sections below to see which words and patterns to practice.`}
          </Text>
        </Animated.View>

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
              pronPollCount < 18
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
        </Animated.View>

        {/* Detail Toggle */}
        <TouchableOpacity
          style={styles.detailToggle}
          onPress={() => setShowDetailedAnalysis(!showDetailedAnalysis)}
        >
          <Text style={styles.detailToggleText}>
            {showDetailedAnalysis ? "📊 Hide" : "📊 Show"} Detailed Analysis
          </Text>
        </TouchableOpacity>

        {/* Dev-only: re-run pronunciation for past sessions */}
        {__DEV__ && !!sessionId && sessionId !== "session-id" && (
          <TouchableOpacity
            style={[styles.detailToggle, { marginTop: 10 }]}
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

        {/* Pronunciation 3-tab component (replaces Words + Accent sections). */}
        {(() => {
          const rawIssues = data.pronunciationIssues || [];
          const normalized: PronIssueNormalized[] = rawIssues.map((it: any, idx: number) => {
            const parsed = parsePronunciationIssue(it);
            return {
              id: String(it.id ?? `${idx}`),
              correct: (it.correct ?? parsed.correctWord ?? it.word ?? "").trim() || "—",
              spoken: (it.spoken ?? parsed.spokenWord ?? it.word ?? "").trim() || "—",
              rule_category: (it.rule_category ?? it.issueType ?? "").trim() || "general_mispronunciation",
              confidence: it.confidence != null ? Number(it.confidence) : undefined,
              word_index: typeof it.word_index === "number" ? it.word_index : undefined,
              suggestion: it.suggestion,
            };
          });

          // While the pipeline is still finishing, show the tabs with zero issues and transcript.
          const shouldShow =
            normalized.length > 0 ||
            (!!sessionData?.analyses?.length && pronPollCount < 18) ||
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
              onPractice={(ruleCategory) =>
                navigation
                  .getParent()
                  ?.navigate("MainTabs", { screen: "eBites", params: { ruleCategory } })
              }
              enteringDelay={400}
            />
          );
        })()}

        {/* Strengths & Areas to Improve */}
        {(data.strengths.length > 0 || data.improvementAreas.length > 0) && (
          <Animated.View entering={FadeInDown.delay(800).springify()}>
            <Text style={styles.sectionTitle}>Performance Breakdown</Text>
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

        {/* Key Mistakes (reference the highlighted spots in the conversation above) */}
        <Text style={styles.sectionTitle}>
          Key Mistakes {data.mistakes.length > 0 && `(${data.mistakes.length})`}
        </Text>
        {data.mistakes.length > 0 && (sessionData?.feedback?.transcript ?? sessionData?.summaryJson?.transcript) && (
          <Text style={styles.keyMistakesHint}>
            See where each mistake appears in your conversation above, then use the cards below to learn the correction.
          </Text>
        )}
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

        {/* MAYA AI Summary – engaging, human copy + real data */}
        {mayaHasContent && (
          <Animated.View entering={FadeInDown.delay(1000).springify()}>
            <Text style={styles.sectionTitle}>What MAYA noticed</Text>
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
      paddingHorizontal: theme.spacing.l,
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
      marginHorizontal: theme.spacing.l,
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
      marginHorizontal: theme.spacing.l,
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
    whatItMeansCard: {
      marginHorizontal: theme.spacing.l,
      marginBottom: theme.spacing.m,
      padding: theme.spacing.m,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.primary,
    },
    whatItMeansTitle: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "700",
      color: theme.colors.text.primary,
      marginBottom: 6,
    },
    whatItMeansText: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.secondary,
      lineHeight: 20,
    },
    sectionTitle: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "bold",
      color: theme.colors.text.primary,
      paddingHorizontal: theme.spacing.l,
      marginBottom: theme.spacing.m,
      marginTop: theme.spacing.m,
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
      marginHorizontal: theme.spacing.l,
      borderRadius: 16,
      padding: theme.spacing.m,
      gap: theme.spacing.m,
      borderWidth: 1,
      borderColor: glassBorder,
      ...theme.shadows.medium,
    },
    transcriptSection: {
      marginBottom: theme.spacing.s,
    },
    transcriptCard: {
      backgroundColor: glassBg,
      marginHorizontal: theme.spacing.l,
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
      paddingHorizontal: theme.spacing.l,
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
      paddingHorizontal: theme.spacing.l,
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
      paddingHorizontal: theme.spacing.l,
      gap: theme.spacing.s,
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
      marginHorizontal: theme.spacing.l,
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
      color: theme.colors.error,
      textDecorationLine: "line-through",
      lineHeight: 20,
    },
    correctedText: {
      flex: 1,
      fontSize: theme.typography.sizes.s,
      color: theme.colors.success,
      fontWeight: "500",
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
    detailToggle: {
      alignSelf: "center",
      paddingVertical: 12,
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    detailToggleText: {
      color: theme.colors.primary,
      fontSize: theme.typography.sizes.s,
      fontWeight: "600",
    },
  });
};
