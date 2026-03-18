import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAppTheme } from "../../theme/useAppTheme";
import { SemanticLevelBadge } from "../../components/common/SemanticLevelBadge";
import { LevelType } from "../../theme/semanticTokens";
import type { LearningTask } from "../../api/tasks";

type SkillKey = "grammar" | "pronunciation" | "fluency" | "vocabulary";

function clampScore(n: any): number {
  const x = Number(n);
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function scoreColor(score: number, theme: any): string {
  if (score >= 80) return theme.colors.success;
  if (score >= 60) return theme.colors.warning;
  return theme.colors.error;
}

function skillLabel(k: SkillKey): string {
  if (k === "pronunciation") return "Pronunciation";
  if (k === "grammar") return "Grammar";
  if (k === "fluency") return "Fluency";
  return "Vocabulary";
}

function weightLabel(k: SkillKey): string {
  if (k === "pronunciation") return "30% of score";
  if (k === "grammar") return "25% of score";
  if (k === "fluency") return "25% of score";
  return "20% of score";
}

function getSummary(scores: Record<string, number>) {
  const keys: SkillKey[] = ["grammar", "pronunciation", "fluency", "vocabulary"];
  const vals = keys.map((k) => clampScore(scores?.[k]));
  const max = Math.max(...vals);
  const min = Math.min(...vals);

  if (max - min <= 10) {
    return "Your skills are well balanced. Keep practicing consistently.";
  }

  const highest = keys[vals.indexOf(max)];
  const lowest = keys[vals.indexOf(min)];
  return `Your ${skillLabel(highest)} is your strongest asset, but ${skillLabel(
    lowest,
  )} is bringing your overall score down.`;
}

export default function ScoreDetailScreen({ navigation, route }: any) {
  const theme = useAppTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const score = clampScore(route?.params?.score);
  const level = (route?.params?.level ?? "A1") as string;
  const skills = (route?.params?.skills ?? {}) as any;
  const pendingTaskType = (route?.params?.pendingTaskType ?? null) as
    | string
    | null;

  const scores: Record<string, number> = skills?.scores ?? {};
  const deltas: Record<string, number> | null = skills?.deltas ?? null;
  const details: Record<string, { items?: string[]; subtext?: string }> =
    skills?.details ?? {};

  const summary = useMemo(() => getSummary(scores), [scores]);

  const keys: SkillKey[] = ["pronunciation", "grammar", "fluency", "vocabulary"];
  const scoreByKey = useMemo(
    () =>
      keys.reduce((acc, k) => {
        acc[k] = clampScore(scores?.[k]);
        return acc;
      }, {} as Record<SkillKey, number>),
    [scores],
  );

  const lowestSkill = useMemo(() => {
    return keys.reduce((minK, k) => {
      return scoreByKey[k] < scoreByKey[minK] ? k : minK;
    }, keys[0]);
  }, [scoreByKey]);

  const goodSkills = useMemo(() => {
    return keys.filter((k) => scoreByKey[k] >= 70);
  }, [scoreByKey]);

  const [formulaOpen, setFormulaOpen] = useState(false);
  const [cachedPendingTask, setCachedPendingTask] = useState<LearningTask | null>(
    null,
  );

  useEffect(() => {
    // Read cached pending task so this screen can decide whether to route to practice
    // without requiring additional HomeScreen modifications.
    AsyncStorage.getItem("@home_pending_task_cache")
      .then((raw) => {
        if (!raw) return null;
        try {
          return JSON.parse(raw) as LearningTask;
        } catch {
          return null;
        }
      })
      .then((t) => {
        if (t?.id) setCachedPendingTask(t);
      })
      .catch(() => {});
  }, []);

  const handlePracticeFocus = () => {
    const focusType =
      lowestSkill === "pronunciation" || lowestSkill === "grammar" || lowestSkill === "vocabulary"
        ? lowestSkill
        : null;

    // If Home told us there's a pending task type that matches AND we have the cached task,
    // route directly to PracticeTask with the task payload.
    if (
      focusType &&
      pendingTaskType &&
      pendingTaskType.toLowerCase() === focusType &&
      cachedPendingTask &&
      (cachedPendingTask.type || "").toLowerCase() === focusType
    ) {
      navigation.navigate("PracticeTask", { task: cachedPendingTask });
      return;
    }

    // Otherwise, route to AssessmentIntro as requested.
    navigation.navigate("AssessmentIntro");
  };

  const formulaText =
    "(Pronunciation × 30%) + (Grammar × 25%) + (Fluency × 25%) + (Vocabulary × 20%)";
  const substituted = `(${scoreByKey.pronunciation} × 30%) + (${scoreByKey.grammar} × 25%) + (${scoreByKey.fluency} × 25%) + (${scoreByKey.vocabulary} × 20%) = ${score}`;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={theme.colors.gradients.surface}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: Math.max(insets.bottom, 20) + 24,
        }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityLabel="Go back"
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={theme.colors.text.primary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Score</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* SECTION 1 — Summary */}
        <View style={styles.section}>
          <Text style={styles.summaryText}>{summary}</Text>
        </View>

        {/* SECTION 2 — Score display */}
        <View style={styles.section}>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreValue}>{score}</Text>
            <View style={{ marginTop: 8 }}>
              <SemanticLevelBadge
                level={(level?.toLowerCase() || "a1") as LevelType}
                pattern="tinted"
                size="small"
              />
            </View>
            <Text style={styles.scoreHint}>
              Weighted average of your 4 core skills
            </Text>
          </View>
        </View>

        {/* SECTION 3 — Skill breakdown */}
        <View style={styles.section}>
          <View style={styles.grid}>
            {keys.map((k) => {
              const val = scoreByKey[k];
              const delta = deltas?.[k];
              const detail =
                details?.[k]?.items?.[0] ??
                details?.[k]?.subtext ??
                undefined;

              return (
                <View key={k} style={styles.skillCard}>
                  <Text style={styles.skillName}>{skillLabel(k)}</Text>
                  <Text
                    style={[
                      styles.skillScore,
                      { color: scoreColor(val, theme) },
                    ]}
                  >
                    {val}
                  </Text>
                  <Text style={styles.weightText}>{weightLabel(k)}</Text>

                  {typeof delta === "number" && delta !== 0 ? (
                    <Text
                      style={[
                        styles.deltaText,
                        { color: delta > 0 ? theme.colors.success : theme.colors.error },
                      ]}
                    >
                      {delta > 0 ? "↑" : "↓"} {Math.abs(Math.round(delta))}
                    </Text>
                  ) : null}

                  {detail ? (
                    <Text style={styles.detailText} numberOfLines={1}>
                      {detail}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>

        {/* SECTION 4 — What's working / What to improve */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What's going well</Text>
          <View style={styles.panel}>
            {goodSkills.length > 0 ? (
              goodSkills.map((k) => (
                <View key={k} style={styles.row}>
                  <Text style={styles.rowLeft}>{skillLabel(k)}</Text>
                  <Text style={styles.rowRight}>{scoreByKey[k]}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>
                Keep practicing — improvements are on the way
              </Text>
            )}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
            Focus here next
          </Text>
          <View style={styles.panel}>
            <View style={styles.row}>
              <Text style={styles.rowLeft}>{skillLabel(lowestSkill)}</Text>
              <Text style={styles.rowRight}>{scoreByKey[lowestSkill]}</Text>
            </View>

            {lowestSkill === "pronunciation" ? (
              <Text style={styles.muted}>This skill carries the most weight</Text>
            ) : null}

            {details?.[lowestSkill]?.items?.[0] ? (
              <Text style={styles.muted}>{details[lowestSkill].items![0]}</Text>
            ) : details?.[lowestSkill]?.subtext ? (
              <Text style={styles.muted}>{details[lowestSkill].subtext}</Text>
            ) : null}

            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={handlePracticeFocus}
              activeOpacity={0.9}
            >
              <Text style={styles.ctaText}>
                Practice {skillLabel(lowestSkill)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SECTION 5 — Score formula (collapsible) */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.collapseRow}
            onPress={() => setFormulaOpen((v) => !v)}
            activeOpacity={0.85}
          >
            <Text style={styles.collapseTitle}>How is this score calculated?</Text>
            <Ionicons
              name={formulaOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color={theme.colors.text.secondary}
            />
          </TouchableOpacity>
          {formulaOpen ? (
            <View style={styles.panel}>
              <Text style={styles.muted}>{formulaText}</Text>
              <Text style={[styles.muted, { marginTop: 10 }]}>{substituted}</Text>
              <Text style={[styles.muted, { marginTop: 10 }]}>
                Scores are capped based on your current level to reflect true proficiency
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
      ...theme.shadows.small,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: theme.colors.text.primary,
    },
    section: {
      paddingHorizontal: 20,
      marginTop: 12,
    },
    summaryText: {
      fontSize: 20,
      fontWeight: "900",
      color: theme.colors.text.primary,
      letterSpacing: -0.4,
      lineHeight: 26,
    },
    scoreCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      padding: 18,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.shadows.medium,
    },
    scoreValue: {
      fontSize: 54,
      fontWeight: "900",
      color: theme.colors.text.primary,
      letterSpacing: -1,
      textAlign: "center",
    },
    scoreHint: {
      marginTop: 10,
      fontSize: 12,
      fontWeight: "600",
      color: theme.colors.text.secondary,
      textAlign: "center",
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: 12,
    },
    skillCard: {
      width: "48%",
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.shadows.small,
    },
    skillName: {
      fontSize: 13,
      fontWeight: "800",
      color: theme.colors.text.primary,
      marginBottom: 8,
    },
    skillScore: {
      fontSize: 28,
      fontWeight: "900",
      marginBottom: 4,
    },
    weightText: {
      fontSize: 11,
      fontWeight: "700",
      color: theme.colors.text.secondary,
    },
    deltaText: {
      marginTop: 8,
      fontSize: 12,
      fontWeight: "800",
    },
    detailText: {
      marginTop: 8,
      fontSize: 12,
      color: theme.colors.text.secondary,
      fontWeight: "600",
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "900",
      color: theme.colors.text.primary,
      marginBottom: 10,
    },
    panel: {
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.shadows.small,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 6,
    },
    rowLeft: {
      fontSize: 13,
      fontWeight: "800",
      color: theme.colors.text.primary,
    },
    rowRight: {
      fontSize: 13,
      fontWeight: "900",
      color: theme.colors.text.primary,
    },
    muted: {
      marginTop: 8,
      fontSize: 13,
      color: theme.colors.text.secondary,
      fontWeight: "600",
      lineHeight: 18,
    },
    ctaBtn: {
      marginTop: 14,
      height: 48,
      borderRadius: 14,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      ...theme.shadows.medium,
    },
    ctaText: {
      color: "white",
      fontSize: 14,
      fontWeight: "900",
    },
    collapseRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.shadows.small,
    },
    collapseTitle: {
      fontSize: 13,
      fontWeight: "900",
      color: theme.colors.text.primary,
    },
  });

