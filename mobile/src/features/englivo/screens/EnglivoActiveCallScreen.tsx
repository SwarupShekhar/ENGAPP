import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useUser } from "@clerk/clerk-expo";
import { useAppTheme } from "../../../theme/useAppTheme";
import {
  buildAiTutorReportPayload,
  generateReport,
  saveSession,
} from "../../../api/englivo/aiTutor";
import { SessionReport, TutorMessage } from "../../../types/aiTutor";
import { syncBridgeCefr, updateLastActiveApp } from "../../../api/bridgeClient";

export default function EnglivoActiveCallScreen() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user: clerkUser } = useUser();
  const { messages = [], durationSeconds = 0 } = route.params || {};
  const [phase, setPhase] = useState<"generating" | "report" | "error" | "done">("generating");
  const [report, setReport] = useState<SessionReport | null>(null);
  const [reportAttempt, setReportAttempt] = useState(0);

  const runGenerateReport = useCallback(() => {
    setPhase("generating");
    const sessionId = `session_${Date.now()}`;
    const reportBody = buildAiTutorReportPayload({
      sessionId,
      messages: messages.map((m: TutorMessage) => ({
        role: m.role,
        content: m.content,
      })),
      durationSeconds,
    });
    generateReport(reportBody)
      .then((rep) => {
        setReport(rep);
        setPhase("report");
        if (rep.cefrLevel && clerkUser?.id) {
          syncBridgeCefr({
            clerkId: clerkUser.id,
            cefrLevel: rep.cefrLevel,
            fluencyScore: rep.fluencyScore,
            source: "englivo",
          }).catch((err) => console.warn("[Englivo] CEFR sync failed:", err));
        }
      })
      .catch((err) => {
        console.error("[Englivo] generateReport failed:", err);
        setPhase("error");
      });
  }, [clerkUser?.id, durationSeconds, messages]);

  useEffect(() => {
    runGenerateReport();
  }, [runGenerateReport, reportAttempt]);

  if (phase === "generating") {
    return (
      <SafeAreaView style={[styles.container, styles.centered]} edges={["top", "bottom"]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  if (phase === "error") {
    return (
      <SafeAreaView style={[styles.container, styles.centered]} edges={["top", "bottom"]}>
        <Text style={[styles.summaryText, { textAlign: "center", marginBottom: 12, paddingHorizontal: 24 }]}>
          Could not generate your session report. Your session has ended.
        </Text>
        <Text style={[styles.summaryText, { textAlign: "center", marginBottom: 20, paddingHorizontal: 24, fontSize: 13 }]}>
          You can try again once, or return home.
        </Text>
        {reportAttempt < 1 && (
          <TouchableOpacity
            style={[styles.saveButton, { marginBottom: 12 }]}
            onPress={() => setReportAttempt((a) => a + 1)}
          >
            <Text style={styles.saveButtonText}>Retry report</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] })}
        >
          <Text style={styles.saveButtonText}>Return Home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <LinearGradient colors={theme.colors.gradients.surface as any} style={styles.header}>
        <Text style={styles.headerTitle}>Session Report</Text>
      </LinearGradient>
      <ScrollView style={styles.scroll}>
        {report && (
          <View style={styles.summaryCard}>
            <Text style={styles.cardTitle}>Summary</Text>
            <Text style={styles.summaryText}>{report.summary}</Text>
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={async () => {
            if (!report) return;
            await saveSession({
              report,
              messages: messages.map((m: TutorMessage) => ({
                role: m.role,
                content: m.content,
              })),
              duration: durationSeconds,
              durationSeconds,
            });
            if (clerkUser?.id) {
              updateLastActiveApp(clerkUser.id, "CORE").catch(() => {});
            }
            setPhase("done");
            navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
          }}
        >
          <Ionicons name="save-outline" size={20} color="#0F172A" />
          <Text style={styles.saveButtonText}>Save Session</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    centered: { justifyContent: "center", alignItems: "center" },
    header: { padding: theme.spacing.l },
    headerTitle: { fontSize: theme.typography.sizes.xl, fontWeight: "bold", color: theme.colors.text.primary },
    scroll: { flex: 1, padding: theme.spacing.m },
    summaryCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, padding: theme.spacing.l, borderWidth: 1, borderColor: theme.colors.border },
    cardTitle: { fontSize: theme.typography.sizes.m, fontWeight: "bold", color: theme.colors.text.primary, marginBottom: theme.spacing.m },
    summaryText: { fontSize: theme.typography.sizes.m, color: theme.colors.text.secondary, lineHeight: 22 },
    footer: { padding: theme.spacing.m, borderTopWidth: 1, borderTopColor: theme.colors.border },
    saveButton: { flexDirection: "row", gap: theme.spacing.s, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary, paddingVertical: theme.spacing.m, borderRadius: theme.borderRadius.m },
    saveButtonText: { color: "#0F172A", fontWeight: "bold", fontSize: theme.typography.sizes.m },
  });
