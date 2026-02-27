import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { theme } from "../../theme/theme";
import { useUser } from "@clerk/clerk-expo";
import { BenchmarkCard } from "../../components/assessment/BenchmarkCard";
import { RecurringErrorsCard } from "../../components/assessment/RecurringErrorsCard";
import { ReadinessCard } from "../../components/assessment/ReadinessCard";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function AssessmentResultScreen({ navigation, route }: any) {
  const { result } = route.params || {};
  const { user } = useUser();
  const insets = useSafeAreaInsets();

  const handleContinueToHome = async () => {
    try {
      // Mark assessment as completed in Clerk metadata
      if (user) {
        await user.update({
          unsafeMetadata: {
            ...(user.unsafeMetadata || {}),
            assessmentCompleted: true,
          },
        });
      }
    } catch (err) {
      console.error("Failed to update assessment status:", err);
    }

    // Navigate to Home regardless
    navigation.reset({
      index: 0,
      routes: [{ name: "MainTabs" }],
    });
  };

  // Fallback if result is missing (testing)
  const overallLevel = result?.overallLevel || "B1";
  const overallScore = result?.overallScore || 65;
  const plan = result?.personalizedPlan || {
    weeklyGoal: "Improve Fluency",
    dailyFocus: ["Speaking", "Listening"],
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 20,
          paddingBottom: Math.max(insets.bottom, 20) + 20, // Extra padding for safety
        }}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Assessment Complete!</Text>
        </View>

        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          style={styles.scoreCard}
        >
          <LinearGradient
            colors={theme.colors.gradients.primary}
            style={styles.scoreGradient}
          >
            <Text style={styles.scoreLabel}>Overall Level</Text>
            <Text style={styles.scoreValue}>{overallLevel}</Text>
            <View style={styles.scoreCircle}>
              <Text style={styles.scoreCircleText}>
                {Math.round(overallScore)}
              </Text>
            </View>
            {result?.confidence_metrics && (
              <View style={styles.confidenceContainer}>
                <MaterialCommunityIcons
                  name="shield-check"
                  size={16}
                  color="white"
                />
                <Text style={styles.confidenceText}>
                  Confidence:{" "}
                  {Math.round(
                    result.confidence_metrics.overall_confidence.score,
                  )}
                  %
                </Text>
              </View>
            )}
          </LinearGradient>
        </Animated.View>

        {/* Skill Breakdown Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Skill Breakdown</Text>
          <View style={styles.planCard}>
            {Object.entries(result?.skillBreakdown || {}).map(
              ([skill, metrics]: [string, any], index) => (
                <View
                  key={skill}
                  style={{ marginBottom: index === 3 ? 0 : 20 }}
                >
                  <View style={styles.skillHeader}>
                    <View style={styles.skillIconName}>
                      <Ionicons
                        name={
                          skill === "pronunciation"
                            ? "mic"
                            : skill === "fluency"
                              ? "speedometer"
                              : skill === "grammar"
                                ? "library"
                                : "bookmarks"
                        }
                        size={18}
                        color={theme.colors.primary}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.skillName}>
                        {skill.charAt(0).toUpperCase() + skill.slice(1)}
                      </Text>
                    </View>
                    <Text style={styles.skillScore}>
                      {Math.round(
                        (Object.values(metrics).reduce(
                          (a: any, b: any) => a + b,
                          0,
                        ) as number) / Object.values(metrics).length,
                      )}
                      %
                    </Text>
                  </View>

                  {Object.entries(metrics).map(
                    ([subSkill, score]: [string, any]) => (
                      <View key={subSkill} style={styles.subMetricRow}>
                        <Text style={styles.subMetricLabel}>
                          {subSkill
                            .replace(/([A-Z])/g, " $1")
                            .trim()
                            .replace(/^./, (str) => str.toUpperCase())}
                        </Text>
                        <View style={styles.subProgressBarContainer}>
                          <View
                            style={[
                              styles.subProgressBar,
                              {
                                width: `${Math.round(score)}%`,
                                backgroundColor:
                                  score > 70
                                    ? theme.colors.primary
                                    : score > 40
                                      ? theme.colors.secondary
                                      : theme.colors.error,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.subMetricValue}>
                          {Math.round(score)}%
                        </Text>
                      </View>
                    ),
                  )}
                </View>
              ),
            )}
          </View>
        </View>

        {/* Fluency Recalibration Data (Optional Section if available) */}
        {result?.fluencyBreakdown && (
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Fluency Breakdown</Text>
              <View style={styles.recalibratedBadge}>
                <Text style={styles.recalibratedText}>Recalibrated</Text>
              </View>
            </View>
            <View style={styles.planCard}>
              <View style={styles.breakdownGrid}>
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownLabel}>Speech Flow</Text>
                  <Text style={styles.breakdownValue}>
                    {Math.round(result.fluencyBreakdown.speech_flow)}%
                  </Text>
                </View>
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownLabel}>Connected Speech</Text>
                  <Text style={styles.breakdownValue}>
                    {Math.round(
                      result.fluencyBreakdown.connected_speech ||
                        result.fluencyBreakdown.naturalness,
                    )}
                    %
                  </Text>
                </View>
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownLabel}>Prosody</Text>
                  <Text style={styles.breakdownValue}>
                    {Math.round(result.fluencyBreakdown.prosody)}%
                  </Text>
                </View>
                <View style={styles.breakdownItem}>
                  <Text style={styles.breakdownLabel}>Pace Control</Text>
                  <Text style={styles.breakdownValue}>
                    {Math.round(result.fluencyBreakdown.pace_control)}%
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.azureComparison}>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={theme.colors.text.secondary}
                />
                <Text style={styles.azureComparisonText}>
                  Adjusted from Azure's raw fluency of{" "}
                  {Math.round(result.rawAzureMetrics?.fluency || 0)}% for
                  realism.
                </Text>
              </View>

              {/* Connected Speech Examples */}
              {(result.fluencyBreakdown.examples?.linking_detected?.length >
                0 ||
                result.fluencyBreakdown.examples?.reductions_detected?.length >
                  0) && (
                <View style={styles.examplesContainer}>
                  <Text style={styles.examplesTitle}>
                    Connected Speech Patterns
                  </Text>

                  {result.fluencyBreakdown.examples?.linking_detected?.map(
                    (ex: string, i: number) => (
                      <View key={`link-${i}`} style={styles.exampleRow}>
                        <Ionicons
                          name="link-outline"
                          size={14}
                          color={theme.colors.success}
                        />
                        <Text style={styles.exampleText}>Linking: {ex}</Text>
                      </View>
                    ),
                  )}

                  {result.fluencyBreakdown.examples?.reductions_detected?.map(
                    (ex: string, i: number) => (
                      <View key={`red-${i}`} style={styles.exampleRow}>
                        <Ionicons
                          name="trending-down-outline"
                          size={14}
                          color={theme.colors.primary}
                        />
                        <Text style={styles.exampleText}>Reduction: {ex}</Text>
                      </View>
                    ),
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Phase 4: Intelligence Layer */}
        <Animated.View
          entering={FadeInDown.delay(350).springify()}
          style={styles.section}
        >
          <Text style={styles.sectionTitle}>Deep Intelligence</Text>

          {result?.benchmarking && <BenchmarkCard data={result.benchmarking} />}

          {result?.readiness && <ReadinessCard data={result.readiness} />}

          {/* Recurring Errors - fetch from backend separately or pass from result */}
          {result?.recurring_errors && (
            <RecurringErrorsCard patterns={result.recurring_errors} />
          )}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(400).springify()}
          style={styles.section}
        >
          <Text style={styles.sectionTitle}>Your Personalized Path</Text>
          <View style={styles.planCard}>
            <View style={styles.planRow}>
              <Ionicons name="flag" size={24} color={theme.colors.primary} />
              <View style={styles.planTextContainer}>
                <Text style={styles.planLabel}>Weekly Goal</Text>
                <Text style={styles.planValue}>{plan.weeklyGoal}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.planRow}>
              <Ionicons
                name="calendar"
                size={24}
                color={theme.colors.primary}
              />
              <View style={styles.planTextContainer}>
                <Text style={styles.planLabel}>Daily Focus</Text>
                <Text style={styles.planValue}>
                  {plan.dailyFocus.join(", ")}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Detailed Feedback Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detailed Feedback</Text>
          <View style={styles.planCard}>
            {/* 1. Practice Words */}
            <View style={styles.planRow}>
              <Ionicons
                name="mic-outline"
                size={24}
                color={theme.colors.secondary}
              />
              <View style={styles.planTextContainer}>
                <Text style={styles.planLabel}>Words to Practice</Text>
                <Text style={styles.planValue}>
                  {(() => {
                    const uniqueWords = new Set<string>();
                    const report = result?.detailedReport;
                    if (report) {
                      [
                        report.phase1,
                        report.phase2?.attempt1,
                        report.phase2?.attempt2,
                        report.phase3,
                        report.phase4,
                      ].forEach((phase) => {
                        phase?.actionable_feedback?.practice_words?.forEach(
                          (w: string) => uniqueWords.add(w),
                        );
                      });
                    }
                    const words = Array.from(uniqueWords).slice(0, 5); // Limit to 5
                    return words.length > 0
                      ? words.join(", ")
                      : "Great pronunciation!";
                  })()}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* 2. Phoneme Tips */}
            <View style={styles.planRow}>
              <Ionicons
                name="school-outline"
                size={24}
                color={theme.colors.secondary}
              />
              <View style={styles.planTextContainer}>
                <Text style={styles.planLabel}>Pro Tips</Text>
                <View style={{ marginTop: 4 }}>
                  {(() => {
                    const uniqueTips = new Set<string>();
                    const report = result?.detailedReport;
                    if (report) {
                      [
                        report.phase1,
                        report.phase2?.attempt1,
                        report.phase2?.attempt2,
                        report.phase3,
                        report.phase4,
                      ].forEach((phase) => {
                        phase?.actionable_feedback?.phoneme_tips?.forEach(
                          (t: string) => uniqueTips.add(t),
                        );
                      });
                    }
                    const tips = Array.from(uniqueTips).slice(0, 3);
                    return tips.length > 0 ? (
                      tips.map((tip, i) => (
                        <Text key={i} style={styles.tipText}>
                          • {tip}
                        </Text>
                      ))
                    ) : (
                      <Text style={styles.planValue}>
                        Keep up the good prosody!
                      </Text>
                    );
                  })()}
                </View>
              </View>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleContinueToHome}>
          <Text style={styles.buttonText}>Continue to Home</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    padding: theme.spacing.l,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: "bold",
    color: theme.colors.text.primary,
  },
  scoreCard: {
    margin: theme.spacing.l,
    height: 200,
    borderRadius: theme.borderRadius.xl,
    ...theme.shadows.medium,
  },
  scoreGradient: {
    flex: 1,
    borderRadius: theme.borderRadius.xl,
    justifyContent: "center",
    alignItems: "center",
  },
  scoreLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: theme.typography.sizes.l,
    marginBottom: theme.spacing.s,
  },
  scoreValue: {
    color: theme.colors.surface,
    fontSize: 64,
    fontWeight: "bold",
    marginBottom: theme.spacing.m,
  },
  scoreCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: theme.spacing.s,
  },
  scoreCircleText: {
    color: theme.colors.surface,
    fontWeight: "600",
    fontSize: theme.typography.sizes.m,
  },
  section: {
    padding: theme.spacing.l,
  },
  sectionTitle: {
    fontSize: theme.typography.sizes.l,
    fontWeight: "bold",
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.m,
  },
  planCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.m,
    ...theme.shadows.small,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.s,
  },
  planTextContainer: {
    marginLeft: theme.spacing.m,
  },
  planLabel: {
    fontSize: theme.typography.sizes.s,
    color: theme.colors.text.secondary,
  },
  planValue: {
    fontSize: theme.typography.sizes.m,
    fontWeight: "600",
    color: theme.colors.text.primary,
  },
  tipText: {
    fontSize: theme.typography.sizes.s,
    color: theme.colors.text.primary,
    marginBottom: 4,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.s,
  },
  button: {
    margin: theme.spacing.l,
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    alignItems: "center",
    ...theme.shadows.primaryGlow,
  },
  buttonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.sizes.l,
    fontWeight: "bold",
  },
  // New Styles
  skillHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  skillName: {
    fontSize: theme.typography.sizes.m,
    fontWeight: "600",
    color: theme.colors.text.primary,
  },
  skillScore: {
    fontSize: theme.typography.sizes.s,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  skillIconName: {
    flexDirection: "row",
    alignItems: "center",
  },
  subMetricRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  subMetricLabel: {
    width: 100,
    fontSize: 10,
    color: theme.colors.text.secondary,
    textTransform: "capitalize",
  },
  subProgressBarContainer: {
    flex: 1,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    marginHorizontal: 8,
    overflow: "hidden",
  },
  subProgressBar: {
    height: "100%",
    borderRadius: 2,
  },
  subMetricValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: theme.colors.text.primary,
    width: 30,
    textAlign: "right",
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: theme.colors.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.m,
  },
  recalibratedBadge: {
    backgroundColor: "rgba(79, 70, 229, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(79, 70, 229, 0.2)",
  },
  recalibratedText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.primary,
    textTransform: "uppercase",
  },
  breakdownGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -8,
  },
  breakdownItem: {
    width: "50%",
    padding: 8,
  },
  breakdownLabel: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    marginBottom: 2,
  },
  breakdownValue: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text.primary,
  },
  azureComparison: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  azureComparisonText: {
    fontSize: 11,
    color: theme.colors.text.secondary,
    fontStyle: "italic",
    flex: 1,
  },
  examplesContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  examplesTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: theme.colors.text.primary,
    marginBottom: 6,
  },
  exampleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  exampleText: {
    fontSize: 10,
    color: theme.colors.text.secondary,
    marginLeft: 6,
    fontStyle: "italic",
  },
  confidenceContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  confidenceText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
});
