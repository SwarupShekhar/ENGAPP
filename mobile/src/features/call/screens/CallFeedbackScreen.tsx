import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeInRight } from "react-native-reanimated";
import { useAppTheme } from "../../../theme/useAppTheme";
import { getLevelColor } from "../../../shared/theme/colorUtils";
import { sessionsApi, ConversationSession } from "../../../api/sessions";

// Feedback Components
import { WordLevelBreakdown } from "./components/WordLevelBreakdown";
import { PracticeTips } from "./components/PracticeTips";
import { GrammarVocabBreakdown } from "./components/GrammarVocabBreakdown";
import { ScoreBreakdownCard } from "./components/ScoreBreakdownCard";

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

// ─── Build highlight ranges from transcript + mistakes ─────
function getTranscriptHighlightRanges(
  transcript: string,
  mistakes: { original_text?: string; original?: string }[],
): [number, number][] {
  const phrases = mistakes
    .map((m) => (m.original_text ?? m.original ?? "").trim())
    .filter((p) => p.length >= 2);
  if (!transcript || phrases.length === 0) return [];

  const lower = transcript.toLowerCase();
  const ranges: [number, number][] = [];

  for (const phrase of phrases) {
    if (!phrase) continue;
    const phraseLower = phrase.toLowerCase();
    let i = 0;
    while (true) {
      const idx = lower.indexOf(phraseLower, i);
      if (idx === -1) break;
      ranges.push([idx, idx + phrase.length]);
      i = idx + 1;
    }
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of ranges) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else {
      merged.push([s, e]);
    }
  }
  return merged;
}

// ─── Transcript with mistake phrases highlighted ───────────
function TranscriptWithHighlights({
  transcript,
  mistakes,
}: {
  transcript: string;
  mistakes: { original_text?: string; original?: string }[];
}) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const ranges = getTranscriptHighlightRanges(transcript, mistakes);
  const segments: { text: string; highlight: boolean }[] = [];
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s > pos) {
      segments.push({
        text: transcript.slice(pos, s),
        highlight: false,
      });
    }
    segments.push({
      text: transcript.slice(s, e),
      highlight: true,
    });
    pos = e;
  }
  if (pos < transcript.length) {
    segments.push({
      text: transcript.slice(pos),
      highlight: false,
    });
  }

  if (segments.length === 0) {
    return (
      <Text style={styles.transcriptText} selectable>
        {transcript}
      </Text>
    );
  }

  return (
    <Text style={styles.transcriptText} selectable>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <Text
            key={i}
            style={[styles.transcriptText, styles.transcriptHighlight]}
          >
            {seg.text}
          </Text>
        ) : (
          seg.text
        ),
      )}
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
  const insets = useSafeAreaInsets();

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
  const wordsFromPronunciation =
    (data.pronunciationIssues || []).map((p: any) => p.word).filter(Boolean) ||
    (data.pronunciationFlagged || []).map((p: any) => p.word ?? p.phoneme).filter(Boolean);
  const advancedWords =
    ((rawData as any)?.ai_detailed_feedback?.vocabulary?.advanced_words as string[]) || []; 
  const wordsToLearn = Array.from(
    new Set([
      ...wordsFromMistakes.slice(0, 5),
      ...wordsFromPronunciation.slice(0, 5),
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

  return (
    <SafeAreaView edges={["bottom"]} style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={theme.colors.text.primary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Call Feedback</Text>
          <View style={styles.backButton} />
        </View>

        {/* Cap notification banner: pronunciation is holding score back */}
        {sessionData?.summaryJson?.pronunciation_cefr_cap && (
          <Animated.View
            entering={FadeInDown.delay(80).springify()}
            style={styles.capBanner}
          >
            <View style={styles.capBannerContent}>
              <Text style={styles.capBannerTitle}>
                Your grammar shows {sessionData.summaryJson.pronunciation_cefr_cap === "B1" ? "B1" : "higher"} potential!
              </Text>
              <Text style={styles.capBannerSubtitle}>
                {sessionData.summaryJson.dominant_pronunciation_errors?.length
                  ? `Focus on ${sessionData.summaryJson.dominant_pronunciation_errors.slice(0, 2).join(" and ").replace(/_/g, " ")} to reach ${sessionData.summaryJson.pronunciation_cefr_cap}.`
                  : `Fix pronunciation patterns to reach ${sessionData.summaryJson.pronunciation_cefr_cap}.`}
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

        {/* Full conversation transcript (mistakes highlighted when available) */}
        {(sessionData?.feedback?.transcript ?? sessionData?.summaryJson?.transcript) && (
          <Animated.View
            entering={FadeInDown.delay(80).springify()}
            style={styles.transcriptSection}
          >
            <Text style={styles.sectionTitle}>Conversation</Text>
            {data.mistakes.length > 0 && (
              <Text style={styles.transcriptHint}>
                Mistakes are highlighted below so you can see exactly where to improve.
              </Text>
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

        {/* New Score Breakdown */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <ScoreBreakdownCard
            scores={data.scores}
            justifications={{
              pronunciation: data.aiFeedback?.pronunciation?.justification,
              grammar: data.aiFeedback?.grammar?.justification,
              vocabulary: data.aiFeedback?.vocabulary?.justification,
              fluency: data.aiFeedback?.fluency?.justification,
            }}
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

        {/* Words to work on (pronunciation) – so user knows which words drove the score */}
        {(data.pronunciationIssues?.length > 0 ||
          (data.pronunciationFlagged?.length ?? 0) > 0 ||
          data.dominantPronunciationErrors?.length > 0) && (
          <Animated.View entering={FadeInDown.delay(400).springify()}>
            <Text style={styles.sectionTitle}>Words to work on</Text>
            <Text style={styles.wordsToWorkOnSubtitle}>
              These words affected your pronunciation score. Practice saying them clearly.
            </Text>
            <View style={styles.glassCard}>
              {data.pronunciationIssues?.length > 0 &&
                data.pronunciationIssues.map((issue: any, i: number) => (
                  <View key={issue.id || i} style={styles.pronunciationIssueRow}>
                    <View style={styles.pronunciationIssueWord}>
                      <Text style={styles.pronunciationIssueWordText}>{issue.word}</Text>
                      {(issue.phoneticExpected || issue.phoneticActual) && (
                        <Text style={styles.phoneticText}>
                          {issue.phoneticActual
                            ? `You: /${issue.phoneticActual}/ → Try: /${issue.phoneticExpected || "—"}/`
                            : `Expected: /${issue.phoneticExpected || "—"}/`}
                        </Text>
                      )}
                    </View>
                    {(issue.suggestion || issue.issueType) && (
                      <Text style={styles.pronunciationIssueSuggestion}>
                        {issue.suggestion || issue.issueType}
                      </Text>
                    )}
                  </View>
                ))}
              {(data.pronunciationFlagged?.length ?? 0) > 0 &&
                data.pronunciationIssues?.length === 0 &&
                (data.pronunciationFlagged ?? []).map((item: any, i: number) => (
                  <View key={i} style={styles.pronunciationIssueRow}>
                    <Text style={styles.pronunciationIssueWordText}>
                      {item.word ?? item.phoneme ?? "—"}
                    </Text>
                    {item.error_type && (
                      <Text style={styles.pronunciationIssueSuggestion}>{item.error_type}</Text>
                    )}
                  </View>
                ))}
              {data.dominantPronunciationErrors?.length > 0 && (
                <View style={styles.dominantErrorsWrap}>
                  <Text style={styles.dominantErrorsLabel}>Focus areas:</Text>
                  <Text style={styles.dominantErrorsText}>
                    {data.dominantPronunciationErrors
                      .map((e: string) => e.replace(/_/g, " "))
                      .join(" • ")}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* Accent & Pronunciation Analysis */}
        {(data.accentNotes || data.pronunciationTip) && (
          <Animated.View entering={FadeInDown.delay(750).springify()}>
            <Text style={styles.sectionTitle}>Accent & Pronunciation</Text>
            <View style={styles.glassCard}>
              <View style={styles.accentHeader}>
                <View style={styles.accentIconContainer}>
                  <Ionicons
                    name="globe-outline"
                    size={20}
                    color={theme.colors.primary}
                  />
                </View>
                <Text style={styles.accentTitle}>Accent Analysis</Text>
              </View>
              {data.accentNotes && (
                <Text style={styles.accentText}>{data.accentNotes}</Text>
              )}
              {data.pronunciationTip && (
                <View style={styles.tipRow}>
                  <Ionicons
                    name="bulb-outline"
                    size={14}
                    color={theme.colors.warning}
                  />
                  <Text style={styles.tipText}>{data.pronunciationTip}</Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

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

const getStyles = (theme: any) =>
  StyleSheet.create({
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
    backButton: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
    },
    headerTitle: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "bold",
      color: theme.colors.text.primary,
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
      backgroundColor: "rgba(255, 255, 255, 0.85)",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.6)",
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
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    pronunciationIssueWord: {
      marginBottom: 4,
    },
    pronunciationIssueWordText: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "600",
      color: theme.colors.text.primary,
    },
    phoneticText: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.secondary,
      marginTop: 2,
      fontFamily: "monospace",
    },
    pronunciationIssueSuggestion: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.primary,
      marginTop: 4,
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
      backgroundColor: "rgba(255, 255, 255, 0.85)",
      marginHorizontal: theme.spacing.l,
      borderRadius: 16,
      padding: theme.spacing.m,
      gap: theme.spacing.m,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.6)",
      ...theme.shadows.medium,
    },
    transcriptSection: {
      marginBottom: theme.spacing.s,
    },
    transcriptCard: {
      backgroundColor: "rgba(255, 255, 255, 0.85)",
      marginHorizontal: theme.spacing.l,
      borderRadius: 16,
      padding: theme.spacing.m,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.6)",
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
    // Strengths & Improvements
    strengthsRow: {
      paddingHorizontal: theme.spacing.l,
      gap: theme.spacing.s,
    },
    strengthCard: {
      backgroundColor: "rgba(255, 255, 255, 0.85)",
      borderRadius: 16,
      padding: theme.spacing.m,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.6)",
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
      backgroundColor: "rgba(255, 255, 255, 0.85)",
      marginHorizontal: theme.spacing.l,
      marginBottom: theme.spacing.s,
      borderRadius: 16,
      padding: theme.spacing.m,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.6)",
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
    severityBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: theme.borderRadius.circle,
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
      backgroundColor: "rgba(255, 255, 255, 0.85)",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.7)",
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
