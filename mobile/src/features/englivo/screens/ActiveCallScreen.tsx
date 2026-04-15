import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useAppTheme } from "../../../theme/useAppTheme";
import {
  buildAiTutorReportPayload,
  generateReport,
  saveSession,
  type SessionReport,
} from "../../../api/englivoAiTutor";
import { ENGLIVO_AI_ASSISTANT_NAME } from "../constants";

type TutorMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

export default function ActiveCallScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { messages = [], durationSeconds = 0 } = route.params || {};

  const [phase, setPhase] = useState<"generating" | "report" | "done">(
    "generating",
  );
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [error, setError] = useState("");

  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    setPhase("generating");
    try {
      const sessionId = `session_${Date.now()}`;
      const rep = await generateReport(
        buildAiTutorReportPayload({
          sessionId,
          messages: messages.map((m: TutorMessage) => ({
            role: m.role,
            content: m.content,
          })),
          durationSeconds,
        }),
      );
      setReport(rep);
      setPhase("report");
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to generate report.");
      setPhase("report");
    }
  };

  const handleSave = async () => {
    if (!report) return;
    setSaving(true);
    try {
      await saveSession({
        report,
        messages: messages.map((m: TutorMessage) => ({
          role: m.role,
          content: m.content,
        })),
        duration: durationSeconds,
        durationSeconds,
      });
      setPhase("done");
    } catch (e: any) {
      Alert.alert("Save Error", e?.message || "Failed to save session.");
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = () => {
    navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
  };

  const ScoreBar = ({
    label,
    score,
    color,
  }: {
    label: string;
    score: number;
    color: string;
  }) => (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.scoreBarBg}>
        <View
          style={[
            styles.scoreBarFill,
            { width: `${score}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={[styles.scoreValue, { color }]}>{score}</Text>
    </View>
  );

  if (phase === "generating") {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.generatingText}>Generating your report...</Text>
        <Text style={styles.generatingSub}>
          Analysing {messages.length} messages over {durationMinutes} min
        </Text>
      </SafeAreaView>
    );
  }

  if (phase === "done") {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <View style={styles.doneIcon}>
          <Ionicons name="checkmark-circle" size={80} color="#34D399" />
        </View>
        <Text style={styles.doneTitle}>Session Saved!</Text>
        <Text style={styles.doneSub}>
          Your progress has been recorded. Keep it up!
        </Text>
        <TouchableOpacity style={styles.doneButton} onPress={handleFinish}>
          <Text style={styles.doneButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={theme.colors.gradients.surface as any}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Session Report</Text>
        <Text style={styles.headerSub}>
          {durationMinutes} min · {messages.length} exchanges
        </Text>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={24} color="#F87171" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : report ? (
          <>
            <View style={styles.cefrRow}>
              <View style={styles.cefrBadge}>
                <Text style={styles.cefrLevel}>{report.cefrLevel}</Text>
                <Text style={styles.cefrLabel}>CEFR Level</Text>
              </View>
              <View style={styles.overallScore}>
                <Text style={styles.overallValue}>{report.fluencyScore}</Text>
                <Text style={styles.overallLabel}>Overall</Text>
              </View>
            </View>

            <View style={styles.scoresCard}>
              <Text style={styles.cardTitle}>Skill Breakdown</Text>
              <ScoreBar label="Fluency" score={report.fluencyScore} color="#26A69A" />
              <ScoreBar label="Grammar" score={report.grammarScore} color="#5C6BC0" />
              <ScoreBar
                label="Pronunciation"
                score={report.pronunciationScore}
                color="#EF5350"
              />
              <ScoreBar
                label="Vocabulary"
                score={report.vocabularyScore}
                color="#FFA726"
              />
            </View>

            {report.summary ? (
              <View style={styles.summaryCard}>
                <Text style={styles.cardTitle}>Summary</Text>
                <Text style={styles.summaryText}>{report.summary}</Text>
              </View>
            ) : null}

            {report.improvements?.length > 0 && (
              <View style={styles.summaryCard}>
                <Text style={styles.cardTitle}>Focus Areas</Text>
                {report.improvements.map((imp, i) => (
                  <View key={i} style={styles.improvementRow}>
                    <Ionicons
                      name="arrow-forward-circle-outline"
                      size={16}
                      color={theme.colors.primary}
                    />
                    <Text style={styles.improvementText}>{imp}</Text>
                  </View>
                ))}
              </View>
            )}

            {messages.length > 0 && (
              <View style={styles.summaryCard}>
                <Text style={styles.cardTitle}>Transcript</Text>
                {messages.map((msg: TutorMessage, idx: number) => (
                  <View key={idx} style={styles.transcriptRow}>
                    <Text style={styles.transcriptRole}>
                      {msg.role === "user" ? "You" : ENGLIVO_AI_ASSISTANT_NAME}:
                    </Text>
                    <Text style={styles.transcriptText}>{msg.content}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>

      {phase === "report" && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={theme.colors.gradients.primary as any}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveGradient}
            >
              {saving ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={20} color="#0F172A" />
                  <Text style={styles.saveButtonText}>Save Session</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.discardButton} onPress={handleFinish}>
            <Text style={styles.discardText}>Discard</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    centered: { justifyContent: "center", alignItems: "center", gap: theme.spacing.m },
    generatingText: {
      fontSize: theme.typography.sizes.l,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    generatingSub: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
    },
    header: {
      padding: theme.spacing.l,
      paddingTop: theme.spacing.m,
    },
    headerTitle: {
      fontSize: theme.typography.sizes.xl,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    headerSub: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
      marginTop: 4,
    },
    scroll: { flex: 1, padding: theme.spacing.m },
    errorBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#F8717120",
      borderRadius: theme.borderRadius.m,
      padding: theme.spacing.m,
      gap: theme.spacing.s,
      marginBottom: theme.spacing.m,
    },
    errorText: {
      flex: 1,
      color: "#F87171",
      fontSize: theme.typography.sizes.s,
    },
    cefrRow: {
      flexDirection: "row",
      gap: theme.spacing.m,
      marginBottom: theme.spacing.m,
    },
    cefrBadge: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.l,
      alignItems: "center",
      borderWidth: 2,
      borderColor: theme.colors.primary,
    },
    cefrLevel: {
      fontSize: theme.typography.sizes.xxl,
      fontWeight: "black",
      color: theme.colors.primary,
    },
    cefrLabel: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.light,
      marginTop: 4,
    },
    overallScore: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.l,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    overallValue: {
      fontSize: theme.typography.sizes.xxl,
      fontWeight: "black",
      color: theme.colors.text.primary,
    },
    overallLabel: {
      fontSize: theme.typography.sizes.xs,
      color: theme.colors.text.light,
      marginTop: 4,
    },
    scoresCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.l,
      marginBottom: theme.spacing.m,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    cardTitle: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "bold",
      color: theme.colors.text.primary,
      marginBottom: theme.spacing.m,
    },
    scoreRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: theme.spacing.s,
      gap: theme.spacing.s,
    },
    scoreLabel: {
      width: 100,
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
    },
    scoreBarBg: {
      flex: 1,
      height: 8,
      backgroundColor: theme.colors.border,
      borderRadius: 4,
      overflow: "hidden",
    },
    scoreBarFill: {
      height: 8,
      borderRadius: 4,
    },
    scoreValue: {
      width: 32,
      textAlign: "right",
      fontSize: theme.typography.sizes.s,
      fontWeight: "bold",
    },
    summaryCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.l,
      marginBottom: theme.spacing.m,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    summaryText: {
      fontSize: theme.typography.sizes.m,
      color: theme.colors.text.secondary,
      lineHeight: 22,
    },
    improvementRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.s,
      marginBottom: theme.spacing.s,
    },
    improvementText: {
      flex: 1,
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.primary,
      lineHeight: 20,
    },
    transcriptRow: { marginBottom: theme.spacing.s },
    transcriptRole: {
      fontSize: theme.typography.sizes.xs,
      fontWeight: "bold",
      color: theme.colors.primary,
      marginBottom: 2,
    },
    transcriptText: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.primary,
      lineHeight: 18,
    },
    footer: {
      padding: theme.spacing.m,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      gap: theme.spacing.s,
    },
    saveButton: {
      borderRadius: theme.borderRadius.m,
      overflow: "hidden",
      ...theme.shadows.primaryGlow,
    },
    saveGradient: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.spacing.m,
      gap: theme.spacing.s,
    },
    saveButtonText: {
      color: "#0F172A",
      fontWeight: "bold",
      fontSize: theme.typography.sizes.m,
    },
    discardButton: { alignItems: "center", paddingVertical: theme.spacing.s },
    discardText: {
      color: theme.colors.text.light,
      fontSize: theme.typography.sizes.s,
    },
    doneIcon: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: "#34D39920",
      justifyContent: "center",
      alignItems: "center",
    },
    doneTitle: {
      fontSize: theme.typography.sizes.xl,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    doneSub: {
      fontSize: theme.typography.sizes.m,
      color: theme.colors.text.light,
      textAlign: "center",
      paddingHorizontal: theme.spacing.xl,
    },
    doneButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: theme.spacing.m,
      borderRadius: theme.borderRadius.m,
      marginTop: theme.spacing.m,
    },
    doneButtonText: {
      color: "#0F172A",
      fontWeight: "bold",
      fontSize: theme.typography.sizes.m,
    },
  });

