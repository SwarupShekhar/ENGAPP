import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  useAnimatedProps,
} from "react-native-reanimated";

import { useAppTheme } from "../../theme/useAppTheme";
import { tutorApi } from "../../api/tutor";
import { tasksApi, type LearningTask } from "../../api/tasks";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type ScreenState = "READY" | "RECORDING" | "ANALYZING" | "RESULT";

function typeIcon(type: string): string {
  const t = (type || "").toLowerCase();
  if (t === "pronunciation") return "🎙️";
  if (t === "grammar") return "✏️";
  if (t === "vocabulary") return "📖";
  return "📌";
}

function typeLabel(type: string): string {
  const t = (type || "").toLowerCase();
  if (t === "pronunciation") return "Pronunciation Practice";
  if (t === "grammar") return "Grammar Practice";
  if (t === "vocabulary") return "Vocabulary Practice";
  return "Practice";
}

function scoreColor(score: number, theme: any): string {
  if (score >= 80) return theme.colors.success;
  if (score >= 60) return theme.colors.warning;
  return theme.colors.error;
}

function scoreMessage(score: number): string {
  if (score >= 80) return "Excellent! Well done 🎉";
  if (score >= 60) return "Good effort! Try once more to perfect it";
  return "Keep practicing — you'll get there";
}

function normalizeText(s: string) {
  return (s || "").trim().toLowerCase();
}

function computeTextScore(input: string, correct: string): number {
  const a = normalizeText(input);
  const b = normalizeText(correct);
  if (!a) return 0;
  if (a === b) return 100;
  // Simple partial match heuristic (keeps behavior deterministic and debuggable)
  const aTokens = a.split(/\s+/).filter(Boolean);
  const bTokens = b.split(/\s+/).filter(Boolean);
  const bSet = new Set(bTokens);
  const overlap = aTokens.filter((t) => bSet.has(t)).length;
  const ratio = bTokens.length ? overlap / bTokens.length : 0;
  return ratio >= 0.6 ? 60 : 0;
}

const AnimatedNumber = ({ value, color }: { value: number; color: string }) => {
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    animatedValue.value = withSpring(value, { damping: 20, stiffness: 60 });
  }, [value]);

  const animatedProps = useAnimatedProps(() => {
    return { text: `${Math.round(animatedValue.value)}` } as any;
  });

  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
      editable={false}
      value={`${Math.round(value)}`}
      style={[{ color, fontSize: 56, fontWeight: "900", textAlign: "center" }]}
      animatedProps={animatedProps}
    />
  );
};

export default function PracticeTaskScreen({ navigation, route }: any) {
  const theme = useAppTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const task = (route?.params?.task ?? null) as LearningTask | null;
  const isPronunciation = (task?.type || "").toLowerCase() === "pronunciation";

  const [state, setState] = useState<ScreenState>("READY");
  const [timerSec, setTimerSec] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // For grammar/vocab typed practice
  const [textInput, setTextInput] = useState("");

  // Audio recording
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerIntervalRef = useRef<any>(null);

  const pulse = useSharedValue(0);

  useEffect(() => {
    // STATE TRANSITION: start/stop mic pulse animation
    if (state === "RECORDING") {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(0, { duration: 150 });
    }
  }, [state]);

  useEffect(() => {
    return () => {
      // Cleanup: stop timers and unload recording when leaving
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.15, 0.4]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.25]) }],
  }));

  const resetToReady = useCallback(() => {
    // STATE TRANSITION: RESULT → READY (reset practice attempt)
    setState("READY");
    setScore(null);
    setErrorMsg(null);
    setTimerSec(0);
    setTextInput("");
  }, []);

  const startRecording = useCallback(async () => {
    if (!task) return;

    // For grammar/vocabulary, STATE 2 is typing (not recording)
    if (!isPronunciation) {
      // STATE TRANSITION: READY → RECORDING (typing mode)
      setState("RECORDING");
      return;
    }

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission Required", "Microphone access is needed.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setTimerSec(0);

      // STATE TRANSITION: READY → RECORDING
      setState("RECORDING");

      // Timer + auto-stop at 10s
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        setTimerSec((s) => {
          const next = s + 1;
          if (next >= 10) {
            // Auto stop at limit
            stopRecording();
          }
          return Math.min(next, 10);
        });
      }, 1000);
    } catch (e: any) {
      Alert.alert(
        "Error",
        "Failed to start recording. Please check microphone permissions.",
      );
    }
  }, [task, isPronunciation]);

  const stopRecording = useCallback(async () => {
    if (!task) return;

    // For grammar/vocabulary, stopping means scoring typed input
    if (!isPronunciation) {
      // STATE TRANSITION: RECORDING(typing) → RESULT
      const nextScore = computeTextScore(textInput, task.content?.correct || "");
      setScore(nextScore);
      setErrorMsg(null);
      setState("RESULT");
      return;
    }

    const recording = recordingRef.current;
    if (!recording) return;

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = null;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;
      if (!uri) throw new Error("No recording URI");

      // STATE TRANSITION: RECORDING → ANALYZING
      setState("ANALYZING");
      setErrorMsg(null);

      const sessionId = task.sessionId;
      if (!sessionId) {
        throw new Error("Task is missing sessionId (required for assessment)");
      }

      const formData = new FormData();
      formData.append("audio", {
        uri,
        type: "audio/m4a",
        name: "audio.m4a",
      } as any);
      formData.append("referenceText", task.content?.target || "");
      formData.append("sessionId", sessionId);

      const res = await tutorApi.assessPronunciation(formData);
      const rawScore =
        res?.accuracy_score ?? res?.pronunciation_score ?? res?.score ?? 0;
      const nextScore = Math.max(0, Math.min(100, Math.round(rawScore)));

      // STATE TRANSITION: ANALYZING → RESULT
      setScore(nextScore);
      setState("RESULT");
    } catch (e: any) {
      const msg = e?.message || "Assessment failed. Please try again.";
      // STATE TRANSITION: ANALYZING → RESULT (error)
      setErrorMsg(msg);
      setScore(null);
      setState("RESULT");
    } finally {
      setTimerSec(0);
    }
  }, [task, isPronunciation, textInput]);

  const handleComplete = useCallback(async () => {
    if (!task) return;
    try {
      await tasksApi.completeTask(task.id);
      await AsyncStorage.removeItem("@home_pending_task_cache");
      Alert.alert("Success", "Task completed!");
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not complete task. Try again.");
    }
  }, [task, navigation]);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backBtn}
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={22} color={theme.colors.text.primary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Practice</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (!task) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.centerWrap}>
          <Text style={styles.subtitleText}>
            Task not found. Please go back and try again.
          </Text>
        </View>
      </View>
    );
  }

  const expectedPhonemes = task.content?.phonemes?.expected;

  return (
    <View style={styles.root}>
      {header}

      <Animated.View entering={FadeIn.duration(180)} style={styles.content}>
        <Text style={styles.bigIcon}>{typeIcon(task.type)}</Text>
        <Text style={styles.typeLabel}>{typeLabel(task.type)}</Text>

        <Text style={styles.targetText}>{task.content?.target}</Text>
        {task.content?.userSaid != null &&
        task.content?.correct != null &&
        normalizeText(task.content.userSaid) === normalizeText(task.content.correct) ? (
          <Text style={styles.secondaryText} numberOfLines={2}>
            Recorded from your call — practice the pronunciation below
          </Text>
        ) : (
          <>
            <Text style={styles.secondaryText} numberOfLines={2}>
              You said: {task.content?.userSaid || "—"}
            </Text>
            <Text style={styles.secondaryText} numberOfLines={2}>
              Correct: {task.content?.correct || "—"}
            </Text>
          </>
        )}

        {/* READY/RECORDING: pronunciation hint row when available */}
        {isPronunciation && expectedPhonemes ? (
          <View style={styles.hintRow}>
            <Ionicons
              name="sparkles-outline"
              size={16}
              color={theme.colors.text.secondary}
            />
            <Text style={styles.hintText} numberOfLines={1}>
              Phonetic hint: /{expectedPhonemes}/
            </Text>
          </View>
        ) : null}

        {/* STATE 1 / 2 / 3 / 4 rendering (only one block at a time) */}
        {state === "READY" && (
          <View style={styles.bottomArea}>
            {isPronunciation ? (
              <>
                <View style={styles.micWrap}>
                  <TouchableOpacity
                    style={styles.micButton}
                    onPress={startRecording}
                    activeOpacity={0.9}
                    accessibilityLabel="Tap to record"
                  >
                    <Ionicons name="mic" size={26} color="white" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.bottomLabel}>Tap to record</Text>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={startRecording}
                  activeOpacity={0.9}
                >
                  <Text style={styles.primaryBtnText}>Type your answer</Text>
                </TouchableOpacity>
                <Text style={styles.bottomLabel}>
                  Enter the corrected version to complete
                </Text>
              </>
            )}

            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        )}

        {state === "RECORDING" && (
          <View style={styles.bottomArea}>
            {isPronunciation ? (
              <>
                <View style={styles.micWrap}>
                  <Animated.View style={[styles.micRing, ringStyle]} />
                  <TouchableOpacity
                    style={[styles.micButton, styles.micButtonRecording]}
                    onPress={stopRecording}
                    activeOpacity={0.9}
                    accessibilityLabel="Tap to stop recording"
                  >
                    <Ionicons name="stop" size={24} color="white" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.bottomLabel}>
                  Recording... tap to stop
                </Text>
                <Text style={styles.timerText}>{timerSec}s</Text>
              </>
            ) : (
              <>
                <View style={styles.inputWrap}>
                  <TextInput
                    value={textInput}
                    onChangeText={setTextInput}
                    placeholder="Type the correct version..."
                    placeholderTextColor={theme.colors.text.secondary}
                    style={styles.textInput}
                    editable={true}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={stopRecording}
                  activeOpacity={0.9}
                >
                  <Text style={styles.primaryBtnText}>Check</Text>
                </TouchableOpacity>
                <Text style={styles.bottomLabel}>
                  Compare your answer with the correction
                </Text>
              </>
            )}

            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        )}

        {state === "ANALYZING" && (
          <View style={styles.bottomArea}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.bottomLabel}>Analyzing your pronunciation...</Text>
          </View>
        )}

        {state === "RESULT" && (
          <View style={styles.bottomArea}>
            {errorMsg ? (
              <>
                <Text style={styles.errorTitle}>Something went wrong</Text>
                <Text style={styles.secondaryText}>{errorMsg}</Text>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={resetToReady}
                  activeOpacity={0.9}
                >
                  <Text style={styles.primaryBtnText}>Retry</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <AnimatedNumber
                  value={score ?? 0}
                  color={scoreColor(score ?? 0, theme)}
                />
                <Text style={styles.resultMsg}>{scoreMessage(score ?? 0)}</Text>

                {(score ?? 0) >= 80 ? (
                  <TouchableOpacity
                    style={styles.completeBtn}
                    onPress={handleComplete}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.completeBtnText}>Complete Task ✓</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={resetToReady}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.primaryBtnText}>Try Again</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingHorizontal: theme.spacing.l,
      paddingBottom: theme.spacing.s,
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
    content: {
      flex: 1,
      paddingHorizontal: theme.spacing.l,
      paddingTop: theme.spacing.m,
      alignItems: "center",
    },
    bigIcon: {
      fontSize: 56,
      marginBottom: 8,
    },
    typeLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.text.secondary,
      marginBottom: 14,
    },
    targetText: {
      fontSize: 28,
      fontWeight: "900",
      color: theme.colors.text.primary,
      textAlign: "center",
      letterSpacing: -0.6,
      marginBottom: 10,
    },
    secondaryText: {
      fontSize: 14,
      color: theme.colors.text.secondary,
      textAlign: "center",
      marginBottom: 6,
    },
    hintRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: theme.spacing.s,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.shadows.small,
    },
    hintText: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      fontWeight: "600",
      maxWidth: 280,
    },
    bottomArea: {
      width: "100%",
      position: "absolute",
      left: theme.spacing.l,
      right: theme.spacing.l,
      bottom: 30,
      alignItems: "center",
      paddingHorizontal: theme.spacing.l,
    },
    micWrap: {
      width: 96,
      height: 96,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    micRing: {
      position: "absolute",
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: theme.colors.error,
    },
    micButton: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      ...theme.shadows.medium,
    },
    micButtonRecording: {
      backgroundColor: theme.colors.error,
    },
    bottomLabel: {
      fontSize: 13,
      color: theme.colors.text.secondary,
      fontWeight: "600",
      marginTop: 4,
      textAlign: "center",
    },
    timerText: {
      marginTop: 6,
      fontSize: 12,
      color: theme.colors.text.secondary,
      fontWeight: "700",
    },
    primaryBtn: {
      width: "100%",
      height: 52,
      borderRadius: 14,
      backgroundColor: theme.colors.primary + "20",
      borderWidth: 1,
      borderColor: theme.colors.primary + "40",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    primaryBtnText: {
      fontSize: 15,
      fontWeight: "800",
      color: theme.colors.primary,
    },
    completeBtn: {
      width: "100%",
      height: 52,
      borderRadius: 14,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
      ...theme.shadows.medium,
    },
    completeBtnText: {
      fontSize: 15,
      fontWeight: "800",
      color: "white",
    },
    skipText: {
      marginTop: 14,
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.text.secondary,
    },
    resultMsg: {
      marginTop: 8,
      fontSize: 14,
      fontWeight: "700",
      color: theme.colors.text.secondary,
      textAlign: "center",
      marginBottom: 8,
    },
    errorTitle: {
      fontSize: 18,
      fontWeight: "900",
      color: theme.colors.error,
      marginBottom: 8,
    },
    inputWrap: {
      width: "100%",
      marginBottom: 10,
    },
    textInput: {
      width: "100%",
      minHeight: 52,
      borderRadius: 14,
      paddingHorizontal: 14,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text.primary,
      ...theme.shadows.small,
      fontSize: 14,
      fontWeight: "600",
    },
    centerWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing.l,
    },
    subtitleText: {
      fontSize: 14,
      color: theme.colors.text.secondary,
      textAlign: "center",
    },
  });

