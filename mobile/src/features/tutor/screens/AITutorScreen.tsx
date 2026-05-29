import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
} from "react-native";

let Haptics: { impactAsync: (s: any) => Promise<void>; ImpactFeedbackStyle: { Light: any; Medium: any } } = {
  impactAsync: async () => {},
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
};
try { Haptics = require('expo-haptics'); } catch { /* optional */ }
import { SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInUp,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
} from "react-native-reanimated";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { useFocusEffect } from "@react-navigation/native";
import { Audio } from "expo-av";
import { useAppTheme } from "../../../theme/useAppTheme";
import { tutorApi } from "../services/tutorApi";
import { streamingTutor, StreamChunk } from "../../call/services/streamingTutorService";
import { PronunciationBreakdown } from "../../../components/PronunciationBreakdown";
import { bridgeApi } from "../../../api/bridgeApi";
import { getCachedToken } from "../../../api/authToken";
import {
  activeLatencyTimeline,
  type LatencyTrace,
} from "../../../utils/latencyTimeline";
import { LatencyTimelinePanel } from "../../../components/debug/LatencyTimelinePanel";
import { resolveVadProvider } from "../voice/voiceActivityDetector";
import {
  startMayaCapture,
  type MayaCaptureHandle,
} from "../voice/mayaAudioCapture";
import { Buffer } from "buffer";
import { useAnalytics } from "../../../analytics/useAnalytics";
import { AnalyticsEvents } from "../../../analytics/events";
import { analyticsMeta } from "../../../analytics/eventMeta";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/** Target phrase when the tutor asks the user to repeat / say / pronounce (SSE + WS + playback). */
function extractReferenceForPronunciation(aiMessage: string): string | null {
  if (!aiMessage?.trim()) return null;
  const patterns: RegExp[] = [
    /(?:say|saying|repeat|try|pronounce|speak|boli(?:ye|o)?)\s*(?:after me|this|the word|it)?\s*[:-]?\s*["']([^"']{1,140})["']/i,
    /(?:repeat\s+after\s+me)\s*[:-]?\s*["']([^"']{1,140})["']/i,
    /(?:I'd like you to|I want you to|can you|could you|please)\s+(?:say|repeat|pronounce)\s*[:-]?\s*["']([^"']{1,140})["']/i,
    /(?:the word|phrase|sentence)\s+is\s*["']([^"']{1,140})["']/i,
    /(?:hear you say|listen for)\s*[:-]?\s*["']([^"']{1,140})["']/i,
  ];
  for (const re of patterns) {
    const m = aiMessage.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  const lower = aiMessage.toLowerCase();
  if (/\bpractice\b/.test(lower)) {
    const m = aiMessage.match(/["']([^"']{2,80})["']/);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

// ─── Typing Dots ──────────────────────────────────────────
function TypingDots() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    dot1.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 300 }),
        withTiming(0, { duration: 300 }),
      ),
      -1,
      false,
    );
    dot2.value = withRepeat(
      withDelay(
        150,
        withSequence(
          withTiming(-6, { duration: 300 }),
          withTiming(0, { duration: 300 }),
        ),
      ),
      -1,
      false,
    );
    dot3.value = withRepeat(
      withDelay(
        300,
        withSequence(
          withTiming(-6, { duration: 300 }),
          withTiming(0, { duration: 300 }),
        ),
      ),
      -1,
      false,
    );
  }, []);

  const s1 = useAnimatedStyle(() => ({
    transform: [{ translateY: dot1.value }],
  }));
  const s2 = useAnimatedStyle(() => ({
    transform: [{ translateY: dot2.value }],
  }));
  const s3 = useAnimatedStyle(() => ({
    transform: [{ translateY: dot3.value }],
  }));

  return (
    <View style={styles.typingRow}>
      <View
        style={[styles.miniAvatar, { backgroundColor: theme.colors.primary }]}
      >
        <Text style={styles.miniAvatarText}>L</Text>
      </View>
      <View style={styles.typingBubble}>
        <Animated.View style={[styles.dot, s1]} />
        <Animated.View style={[styles.dot, s2]} />
        <Animated.View style={[styles.dot, s3]} />
      </View>
    </View>
  );
}

// ─── Transcript Bubble ────────────────────────────────────
function TranscriptBubble({ item, index }: { item: any; index: number }) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const isUser = item.speaker === "user";
  return (
    <Animated.View
      entering={FadeInUp.delay(index * 80)
        .springify()
        .damping(15)}
      style={[
        { width: "100%", marginBottom: 16 },
        isUser ? { alignItems: "flex-end" } : { alignItems: "flex-start" },
      ]}
    >
      <View
        style={[
          styles.bubbleRow,
          isUser ? styles.bubbleRowRight : styles.bubbleRowLeft,
        ]}
      >
        {!isUser && (
          <View style={styles.avatarContainer}>
            <View style={styles.avatarGlow} />
            <LinearGradient
              colors={["#6366f1", "#a855f7"]}
              style={styles.miniAvatar}
            >
              <Text style={styles.miniAvatarText}>M</Text>
            </LinearGradient>
          </View>
        )}

        <View
          style={[
            styles.bubbleWrapper,
            isUser ? styles.bubbleWrapperUser : styles.bubbleWrapperPartner,
          ]}
        >
          {isUser ? (
            <View style={[styles.bubble, styles.bubbleUser]}>
              <Text style={[styles.bubbleText, styles.bubbleTextUser]}>
                {item.text}
              </Text>
            </View>
          ) : (
            <BlurView
              intensity={25}
              tint="dark"
              style={[styles.bubble, styles.bubblePartner]}
            >
              <Text style={[styles.bubbleText, styles.bubbleTextPartner]}>
                {item.text}
              </Text>
            </BlurView>
          )}
        </View>

        {isUser && (
          <View style={styles.userAvatarContainer}>
            <LinearGradient
              colors={["#3b82f6", "#2dd4bf"]}
              style={styles.miniAvatar}
            >
              <Ionicons name="person" size={14} color="white" />
            </LinearGradient>
          </View>
        )}
      </View>
      {isUser && item.assessmentResult && (
        <View style={{ width: "90%", marginTop: 8 }}>
          <PronunciationBreakdown result={item.assessmentResult} />
        </View>
      )}
    </Animated.View>
  );
}

let _msgSeq = 0;
const nextMsgId = () => `msg-${++_msgSeq}`;

// ─── Main Screen ──────────────────────────────────────────
export default function AITutorScreen({ navigation, route }: any) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const { user } = useUser();
  const analytics = useAnalytics();
  const { getToken } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // Transcribing...
  const [isStreaming, setIsStreaming] = useState(false); // Receiving AI response
  const [error, setError] = useState<string | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const [streamPath, setStreamPath] = useState<
    "idle" | "sse" | "ws-fallback" | "sse-skipped"
  >("idle");
  const [streamDebugReason, setStreamDebugReason] = useState<string>("none");
  const [turnStartAtLabel, setTurnStartAtLabel] = useState<string>("--:--:--");
  const [firstChunkLatencyMs, setFirstChunkLatencyMs] = useState<number | null>(
    null,
  );
  const [latencyTrace, setLatencyTrace] = useState<LatencyTrace | null>(null);
  const [referenceTextForNextTurn, setReferenceTextForNextTurn] = useState<
    string | null
  >(null);
  const [transcript, setTranscript] = useState<any[]>([]);

  const sessionIdRef = useRef<string | null>(null);
  const transcriptRef = useRef<any[]>([]);
  const streamHandlerRef = useRef<(chunk: StreamChunk) => void>(() => {});
  transcriptRef.current = transcript;
  const scrollRef = useRef<ScrollView>(null);
  const captureHandleRef = useRef<MayaCaptureHandle | null>(null);
  const meteringRecordingRef = useRef<Audio.Recording | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const soundPoolRef = useRef<(Audio.Sound | null)[]>([null, null, null]);
  const soundPoolIndexRef = useRef(0);
  const cefrSyncTriggeredRef = useRef(false);
  const prewarmRef = useRef<Promise<[Awaited<ReturnType<typeof Audio.requestPermissionsAsync>>, any]> | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);
  const turnStartMsRef = useRef<number | null>(null);
  const firstChunkSeenRef = useRef<boolean>(false);

  const syncCefrLevelOnce = async () => {
    if (cefrSyncTriggeredRef.current) return;
    cefrSyncTriggeredRef.current = true;

    const clerkId = user?.id;
    if (!clerkId) return;

    try {
      await bridgeApi.syncCefrLevel({ clerkId });
    } catch (e) {
      console.warn("[AITutor] bridgeApi.syncCefrLevel failed:", e);
    }
  };

  const turnTraceIdRef = useRef<string | null>(null);
  /** Learner CEFR level (A1..C2). Set after startSession; piped into WS fallback so backend-ai
   *  can adapt vocabulary when the SSE → Nest CEFR injection is skipped. */
  const cefrLevelRef = useRef<string | null>(null);
  /** Optional "Phrase of the day" handed from PulseHomeCarousel — kicks off the first prompt. */
  const seedPhraseRef = useRef<{ phrase?: string; example?: string; definition?: string } | null>(
    route?.params?.phrase ?? null,
  );
  const tutorOpenTrackedRef = useRef(false);

  useEffect(() => {
    if (tutorOpenTrackedRef.current) return;
    tutorOpenTrackedRef.current = true;
    const source =
      (route?.params?.source as string | undefined) ??
      (route?.params?.phrase ? "phrase_of_day" : "unknown");
    analytics.capture(
      AnalyticsEvents.AI_TUTOR_OPENED,
      analyticsMeta({
        source,
        has_seed_phrase: Boolean(route?.params?.phrase),
      }),
    );
  }, [analytics, route?.params?.phrase, route?.params?.source]);

  useFocusEffect(
    useCallback(() => {
      if (!prewarmRef.current && user?.id) {
        prewarmRef.current = Promise.all([
          Audio.requestPermissionsAsync(),
          tutorApi.startSession(user.id),
        ]);
      }
    }, [user?.id]),
  );

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch((err) => console.warn("Audio mode error:", err));
  }, []);

  // Pulse Rings
  const pulseScale1 = useSharedValue(1);
  const pulseOpacity1 = useSharedValue(0);
  const pulseScale2 = useSharedValue(1);
  const pulseOpacity2 = useSharedValue(0);

  useEffect(() => {
    pulseScale1.value = withRepeat(
      withTiming(1.6, { duration: 1500 }),
      -1,
      false,
    );
    pulseOpacity1.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 0 }),
        withTiming(0, { duration: 1500 }),
      ),
      -1,
      false,
    );

    pulseScale2.value = withRepeat(
      withDelay(750, withTiming(1.6, { duration: 1500 })),
      -1,
      false,
    );
    pulseOpacity2.value = withRepeat(
      withDelay(
        750,
        withSequence(
          withTiming(0.3, { duration: 0 }),
          withTiming(0, { duration: 1500 }),
        ),
      ),
      -1,
      false,
    );

    // Initialize Session

    // Start Session
    const init = async () => {
      try {
        // 1. Show immediate joining bubble to eliminate perceived lag (English-only).
        const initialName = user?.firstName || "Friend";
        setTranscript([
          {
            id: "welcome",
            speaker: "ai",
            text: `Hi ${initialName}, Maya is joining…`,
          },
        ]);

        // Split into independent promises so WS connects as soon as session resolves
        const permPromise = prewarmRef.current
          ? prewarmRef.current.then(([p]) => p)
          : Audio.requestPermissionsAsync();
        const sessionPromise = prewarmRef.current
          ? prewarmRef.current.then(([, r]) => r)
          : tutorApi.startSession(user?.id || "test");

        const [perm, res] = await Promise.all([permPromise, sessionPromise]);

        // SSE is primary — register WS handler now; connect lazily on SSE failure only.
        streamingTutor.onMessage((c) => streamHandlerRef.current(c));

        if (perm.status !== "granted") {
          Alert.alert("Permission Required", "Microphone access is needed.");
          return;
        }

        setSessionId(res.sessionId);
        sessionIdRef.current = res.sessionId;
        cefrLevelRef.current = res.cefrLevel || null;

        const greeting = { id: "welcome", speaker: "ai" as const, text: res.message };
        const seed = seedPhraseRef.current;
        const initial = seed?.phrase
          ? [
              greeting,
              {
                id: "seed-prompt",
                speaker: "ai" as const,
                text: `Let's practise today's phrase: "${seed.phrase}". Try saying it.`,
              },
            ]
          : [greeting];
        setTranscript(initial);
        if (seed?.phrase) {
          setReferenceTextForNextTurn(seed.phrase);
        }

        if (res.audioBase64) {
          queueAudio(res.audioBase64);
        }
      } catch (e) {
        console.error("Init error:", e);
        setError("Failed to connect.");
      }
    };
    init();

    return () => {
      sseAbortRef.current?.abort();
      streamingTutor.disconnect();
      if (soundRef.current) soundRef.current.unloadAsync();
      for (let i = 0; i < soundPoolRef.current.length; i++) {
        const s = soundPoolRef.current[i];
        if (s) s.unloadAsync().catch(() => {});
        soundPoolRef.current[i] = null;
      }
      if (captureHandleRef.current) {
        captureHandleRef.current.cancel().catch(() => {});
        captureHandleRef.current = null;
      }

      // Trigger final analysis and save session
      if (sessionIdRef.current) {
        if (__DEV__) console.log("[AITutor] Ending session for analysis:", sessionIdRef.current);
        void tutorApi
          .endSession(sessionIdRef.current)
          .then(() => void syncCefrLevelOnce())
          .catch((err) => {
            console.warn(
              "[AITutor] Failed to end session gracefully:",
              err.message,
            );
          });
      }
    };
  }, []);

  // ─── Stream Handling ────────────────────────────────────
  const handleStreamMessage = (chunk: StreamChunk) => {
    if (chunk.type === "phonetic_ready") {
      activeLatencyTimeline.markInstant("phonetic_ready");
    }
    if (chunk.type === "done") {
      if (chunk.timings?.ms) {
        activeLatencyTimeline.mergeServerTimings(chunk.timings.ms);
      }
      activeLatencyTimeline.finish();
      setLatencyTrace(activeLatencyTimeline.getSnapshot());
    }

    // First meaningful chunk latency marker for this turn.
    if (!firstChunkSeenRef.current) {
      const isMeaningfulChunk =
        (chunk.type === "transcript" || chunk.type === "transcription") &&
          Boolean(chunk.text) ||
        (chunk.type === "sentence" && Boolean(chunk.text)) ||
        (chunk.type === "audio" && Boolean(chunk.audio));
      if (isMeaningfulChunk && turnStartMsRef.current) {
        firstChunkSeenRef.current = true;
        setFirstChunkLatencyMs(Date.now() - turnStartMsRef.current);
        activeLatencyTimeline.endSpan("sse_request");
        if (chunk.type === "transcript" || chunk.type === "transcription") {
          activeLatencyTimeline.markInstant("sse_transcript");
        }
        if (chunk.type === "sentence") {
          activeLatencyTimeline.markInstant("first_sentence");
        }
        if (chunk.type === "audio") {
          activeLatencyTimeline.markInstant("first_audio");
        }
      }
    }

    // "transcript" = first chunk from stream (backend-ai); "transcription" = legacy WebSocket key
    if (chunk.type === "transcription" || chunk.type === "transcript") {
      // Update the placeholder user bubble with the actual transcription
      if (chunk.text) {
        setTranscript((prev) => {
          const tempIndex = prev.findIndex(
            (p) => p.speaker === "user" && p.tempId,
          );
          if (tempIndex >= 0) {
            const updated = [...prev];
            updated[tempIndex] = {
              ...updated[tempIndex],
              text: chunk.text,
              assessmentResult: chunk.assessmentResult,
              tempId: false,
              isTranscribing: false,
            };
            return updated;
          }
          // Fallback
          return [
            ...prev,
            {
              id: nextMsgId(),
              speaker: "user",
              text: chunk.text,
              assessmentResult: chunk.assessmentResult,
            },
          ];
        });
      }
    } else if (chunk.type === "sentence") {
      setIsStreaming(true);
      if (chunk.text) {
        setTranscript((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.speaker === "ai" && last.isStreaming) {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last,
              text: last.text + " " + chunk.text,
            };
            return updated;
          } else {
            return [
              ...prev,
              {
                id: nextMsgId(),
                speaker: "ai",
                text: chunk.text,
                isStreaming: true,
              },
            ];
          }
        });
      }
    } else if (chunk.type === "done") {
      setIsStreaming(false);
      setTranscript((prev) => {
        const last = prev[prev.length - 1];
        if (last?.speaker === "ai" && last.isStreaming) {
          const u = [...prev];
          u[u.length - 1] = { ...last, isStreaming: false };
          return u;
        }
        return prev;
      });
      setTimeout(() => evaluateLastMessageForPronunciation(), 0);
    }

    // Always check for audio in any chunk
    if (chunk.audio) {
      queueAudio(chunk.audio);
    }
  };

  // Evaluate last message for repetition prompts (uses ref so audio callbacks see latest transcript)
  const evaluateLastMessageForPronunciation = () => {
    const t = transcriptRef.current;
    if (t.length === 0) return;
    const lastMsg = t[t.length - 1];
    if (lastMsg.speaker !== "ai") return;

    const ref = extractReferenceForPronunciation(lastMsg.text);
    if (ref) {
      if (__DEV__) console.log("[Pronunciation] Reference text:", ref);
      setReferenceTextForNextTurn(ref);
    } else {
      setReferenceTextForNextTurn(null);
    }
  };

  streamHandlerRef.current = handleStreamMessage;

  // ─── Audio Queue ────────────────────────────────────────
  const queueAudio = (base64: string) => {
    audioQueueRef.current.push(base64);
    playNext();
  };

  const playNext = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    const nextAudio = audioQueueRef.current.shift();

    try {
      if (!nextAudio) {
        isPlayingRef.current = false;
        playNext();
        return;
      }

      // Round-robin through pool of 3 sounds — avoids createAsync overhead per chunk
      const poolIndex = soundPoolIndexRef.current;
      soundPoolIndexRef.current = (poolIndex + 1) % 3;

      let sound = soundPoolRef.current[poolIndex];
      if (sound) {
        try { await sound.unloadAsync(); } catch (_) {}
      } else {
        sound = new Audio.Sound();
        soundPoolRef.current[poolIndex] = sound;
      }

      await sound.loadAsync({ uri: `data:audio/mp3;base64,${nextAudio}` });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          isPlayingRef.current = false;
          playNext();

          if (audioQueueRef.current.length === 0) {
            setIsStreaming(false);
            evaluateLastMessageForPronunciation();
          }
        }
      });
      await sound.playAsync();
    } catch (e) {
      console.error("Play error", e);
      isPlayingRef.current = false;
      setIsStreaming(false);
      playNext();
    }
  };

  // Auto-start recording logic disabled to prevent echo loops
  /*
    useEffect(() => {
        if (!isPlayingRef.current && audioQueueRef.current.length === 0 && !isProcessing && !isRecording && turnCount > 0) {
             // AI finished speaking (or processing error occurred), start listening (VAD)
             // Check if we are still on this screen/session valid
             if (sessionId) {
                setTimeout(() => startRecording(), 500);
             }
        }
    }, [turnCount, isPlayingRef.current, isProcessing]); 
    */

  // ─── Recording ──────────────────────────────────────────
  const startRecording = async () => {
    if (isProcessing || isStreaming || isRecording) return; // Block while streaming/recording
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== "granted") return;

      // Validate previous capture is cleared
      if (captureHandleRef.current) {
        try {
          await captureHandleRef.current.cancel();
        } catch (_) {}
        captureHandleRef.current = null;
      }
      meteringRecordingRef.current = null;
      activeLatencyTimeline.markInstant("vad_listen_start", {
        provider: resolveVadProvider(),
      });
      const handle = await startMayaCapture({
        onSpeechEnd: () => stopRecording(),
        onStatus: (vadStatus, meta) => {
          if (vadStatus === "speech_start") {
            activeLatencyTimeline.markInstant("vad_speech_start", meta);
          }
          if (vadStatus === "speech_end") {
            activeLatencyTimeline.markInstant("vad_speech_end", meta);
          }
        },
      });
      captureHandleRef.current = handle;
      setIsRecording(true);
    } catch (e) {
      console.error("Rec error", e);
    }
  };

  const stopRecording = async () => {
    const handle = captureHandleRef.current;
    if (!handle) return;
    captureHandleRef.current = null;
    setIsRecording(false);
    setIsProcessing(true);

    try {
      const capture = await handle.stop();
      let uri: string | null = null;
      let uploadMime = "audio/m4a";
      let uploadName = "audio.m4a";
      let prebuiltAudioBase64: string | undefined;

      if (capture.providerUsed === "silero" && capture.wavBytes) {
        prebuiltAudioBase64 = Buffer.from(capture.wavBytes).toString("base64");
        uri = `${FileSystem.cacheDirectory}maya-turn-${Date.now()}.wav`;
        try {
          await FileSystem.writeAsStringAsync(uri, prebuiltAudioBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch (e) {
          console.warn("[AITutor] Could not write WAV to cache:", e);
          uri = null;
        }
        uploadMime = "audio/wav";
        uploadName = "audio.wav";
      } else if (capture.recording) {
        meteringRecordingRef.current = capture.recording;
        let recordedDurationMs = 0;
        try {
          const status = await capture.recording.getStatusAsync();
          recordedDurationMs =
            typeof status.durationMillis === "number" ? status.durationMillis : 0;
          if (status.isRecording || status.isDoneRecording) {
            await capture.recording.stopAndUnloadAsync();
          }
        } catch (unloadError: any) {
          if (
            !unloadError.message?.includes("already been unloaded") &&
            !unloadError.message?.includes("Recorder does not exist")
          ) {
            if (__DEV__) console.log("Unload error (ignoring):", unloadError);
          }
        }
        uri = capture.recording.getURI();
        if (recordedDurationMs > 0 && recordedDurationMs < 350) {
          if (__DEV__) {
            console.log("[AITutor] Ignoring short recording tap", recordedDurationMs, "ms");
          }
          setIsProcessing(false);
          return;
        }
      }

      if (!uri) {
        console.warn("[AITutor] No audio URI after stopping capture");
        setIsProcessing(false);
        return;
      }

      if (uri) {
        const traceId = activeLatencyTimeline.start("maya_turn");
        turnTraceIdRef.current = traceId;
        activeLatencyTimeline.markInstant("recording_stop");

        turnStartMsRef.current = Date.now();
        firstChunkSeenRef.current = false;
        setFirstChunkLatencyMs(null);
        setTurnStartAtLabel(new Date(turnStartMsRef.current).toLocaleTimeString());

        const refText = referenceTextForNextTurn;
        const activeSessionId = sessionIdRef.current;

        // Parallelize: base64 encode (needed only for WS fallback) + token fetch simultaneously.
        // Silero path already produced base64 in-memory — skip the disk re-read.
        activeLatencyTimeline.startSpan("audio_read");
        const [audioBase64, token] = await Promise.all([
          prebuiltAudioBase64 !== undefined
            ? Promise.resolve(prebuiltAudioBase64)
            : FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
                .catch((e) => { console.warn("[AITutor] Could not read audio file:", e); return undefined; }),
          getToken ? getCachedToken(getToken) : Promise.resolve<string | null>(null),
        ]);
        activeLatencyTimeline.endSpan("audio_read");

        if (refText && activeSessionId) {
          setReferenceTextForNextTurn(null);
          activeLatencyTimeline.startSpan("assess_pronunciation");
          const requestId = `pron_${activeSessionId}_${Date.now()}`;
          const assessStartedAt = Date.now();
          analytics.capture(
            AnalyticsEvents.PRON_FEEDBACK_REQUESTED,
            analyticsMeta({
              session_id: activeSessionId,
              request_id: requestId,
            }),
          );
          analytics.capture(
            AnalyticsEvents.AZURE_PROSODY_STARTED,
            analyticsMeta({
              session_id: activeSessionId,
              request_id: requestId,
            }),
          );
          const assessForm = new FormData();
          assessForm.append("audio", {
            uri,
            type: uploadMime,
            name: uploadName,
          } as any);
          assessForm.append("userId", user?.id || "test");
          assessForm.append("referenceText", refText);
          assessForm.append("sessionId", activeSessionId);
          assessForm.append("requestId", requestId);
          void tutorApi
            .assessPronunciation(assessForm)
            .then((res) => {
              activeLatencyTimeline.endSpan("assess_pronunciation");
              analytics.capture(
                AnalyticsEvents.AZURE_PROSODY_COMPLETED,
                analyticsMeta({
                  session_id: activeSessionId,
                  request_id: requestId,
                  latency_ms: Date.now() - assessStartedAt,
                  passed: Boolean(res?.passed),
                  accuracy_score: Number(res?.accuracy_score ?? 0),
                  error_code: null,
                }),
              );
              setTranscript((prev) =>
                prev.map((m) =>
                  m.tempId && m.speaker === "user"
                    ? {
                        ...m,
                        tempId: false,
                        text: res.recognized_text || m.text || refText,
                        assessmentResult: res,
                      }
                    : m,
                ),
              );
            })
            .catch((e) => {
              activeLatencyTimeline.endSpan("assess_pronunciation");
              analytics.capture(
                AnalyticsEvents.AZURE_PROSODY_FAILED,
                analyticsMeta({
                  session_id: activeSessionId,
                  request_id: requestId,
                  latency_ms: Date.now() - assessStartedAt,
                  error_code: e?.response?.status ?? e?.code ?? "unknown",
                }),
              );
              if (__DEV__) console.warn("[AITutor] parallel assess failed:", e);
            });
        }

        // SSE first (~2–3s to first audio); pronunciation assess runs in parallel when needed.
        setTranscript((prev) => [
          ...prev,
          {
            id: nextMsgId(),
            speaker: "user",
            text: "...",
            tempId: true,
          },
        ]);

        const formData = new FormData();
        formData.append("audio", {
          uri,
          type: uploadMime,
          name: uploadName,
        } as any);
        formData.append("sessionId", activeSessionId || "");
        if (turnTraceIdRef.current) {
          formData.append("traceId", turnTraceIdRef.current);
        }

        let usedSSE = false;
        let sseSkipped = false;
        if (token && activeSessionId) {
            try {
              sseAbortRef.current?.abort();
              const abortController = new AbortController();
              sseAbortRef.current = abortController;
              activeLatencyTimeline.startSpan("sse_request");
              const response = await tutorApi.streamSpeech(formData, {
                Authorization: `Bearer ${token}`,
              }, abortController.signal);
              if (!response.ok) {
                const errText = await response.text().catch(() => "");
                console.warn(
                  `[Tutor SSE] ${response.status} ${response.statusText}`,
                  errText.slice(0, 500),
                );
                if (__DEV__) {
                  console.log("[Tutor SSE] Falling back to WS due to non-2xx response");
                }
                setStreamPath("ws-fallback");
                setStreamDebugReason(`sse_non_2xx_${response.status}`);
              }
              if (response.ok && response.body) {
                usedSSE = true;
                setStreamPath("sse");
                setStreamDebugReason("ok");
                let userTranscript = "";
                let aiText = "";
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  // Parse SSE: each event is a line "data: {...}\n"
                  const lines = buffer.split("\n");
                  buffer = lines.pop() ?? "";
                  for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    try {
                      const chunk = JSON.parse(line.slice(6).trim());
                      if (chunk.type === "transcript" && chunk.text) userTranscript = chunk.text;
                      if (chunk.type === "sentence" && chunk.text) aiText += (aiText ? " " : "") + chunk.text;
                      if (chunk.type === "done" && chunk.timings?.ms) {
                        activeLatencyTimeline.mergeServerTimings(chunk.timings.ms);
                      }
                      handleStreamMessage(chunk);
                    } catch (_) {
                      /* incomplete or invalid chunk */
                    }
                  }
                }
                if (buffer.trim().startsWith("data: ")) {
                  try {
                    const chunk = JSON.parse(buffer.slice(6).trim());
                    if (chunk.type === "transcript" && chunk.text)
                      userTranscript = chunk.text;
                    if (chunk.type === "sentence" && chunk.text)
                      aiText += (aiText ? " " : "") + chunk.text;
                    handleStreamMessage(chunk);
                  } catch (_) {
                    /* trailing incomplete JSON */
                  }
                }
                if (aiText.trim()) {
                  const ref = extractReferenceForPronunciation(aiText.trim());
                  if (ref) {
                    if (__DEV__)
                      console.log("[Pronunciation] From SSE aggregate:", ref);
                    setReferenceTextForNextTurn(ref);
                  }
                }
                if (audioQueueRef.current.length === 0 && !isPlayingRef.current) {
                  setIsStreaming(false);
                }
                if (userTranscript && aiText.trim()) {
                  tutorApi
                    .appendTurn(activeSessionId, userTranscript, aiText.trim())
                    .catch(() => {});
                }
                if (sseAbortRef.current === abortController) {
                  sseAbortRef.current = null;
                }
              }
            } catch (err: any) {
              if (err?.name === "AbortError") {
                if (__DEV__) console.log("[Tutor SSE] aborted");
              } else {
                console.warn("[Tutor SSE] request failed, falling back to WS:", err?.message || err);
                setStreamPath("ws-fallback");
                setStreamDebugReason("sse_request_error");
              }
              usedSSE = false;
            } finally {
              sseAbortRef.current = null;
            }
          } else if (__DEV__) {
            console.warn(
              "[Tutor SSE] skipped (missing auth token or sessionId), using WS fallback",
            );
            sseSkipped = true;
            setStreamPath("sse-skipped");
            setStreamDebugReason("missing_token_or_session");
          }
          if (!usedSSE && audioBase64) {
            if (!sseSkipped) {
              setStreamPath("ws-fallback");
            }
            if (activeSessionId) {
              streamingTutor.ensureConnected(
                activeSessionId,
                user?.id || "test",
              );
            }
            streamingTutor.sendText(
              null,
              null,
              audioBase64,
              turnTraceIdRef.current ?? undefined,
              cefrLevelRef.current,
            );
          } else if (!usedSSE && !audioBase64) {
            setStreamPath("ws-fallback");
            setStreamDebugReason("no_audio_base64");
          }
        setTurnCount((c) => c + 1);
      }
    } catch (e) {
      console.error("Process error", e);
      setError("Could not process speech.");
    } finally {
      setIsProcessing(false);
      // setIsStreaming(true) happens on first chunk
    }
  };

  // Animation
  const animatedPulseStyle1 = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale1.value }],
    opacity: pulseOpacity1.value,
  }));
  const animatedPulseStyle2 = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale2.value }],
    opacity: pulseOpacity2.value,
  }));

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={
          [
            `${theme.colors.background}`,
            `${theme.colors.surface}`,
            `${theme.colors.background}`,
          ] as [string, string, string]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.background}
      />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={24} color="white" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.onlineBadge} />
            <Text style={styles.headerTitle}>Maya (AI Tutor)</Text>
          </View>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.endSessionBtn}
            onPress={async () => {
              if (isProcessing) return;
              setIsProcessing(true);
              if (sessionIdRef.current) {
                try {
                  await tutorApi.endSession(sessionIdRef.current);
                  await syncCefrLevelOnce();
                  // Make sure we go to the feedback screen instead of just back
                  navigation.replace("CallFeedback", {
                    sessionId: sessionIdRef.current,
                    clerkId: user?.id,
                    partnerInfo: {
                      id: "maya",
                      fname: "Maya",
                      lname: "(AI Tutor)",
                    },
                    isAI: true,
                  });
                } catch (e) {
                  setIsProcessing(false);
                  Alert.alert("Error", "Could not load feedback.");
                }
              } else {
                navigation.goBack();
              }
            }}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.endSessionText}>End Session</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Chat */}
        <ScrollView
          ref={scrollRef}
          style={styles.transcriptScroll}
          contentContainerStyle={styles.transcriptContent}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
        >
          {transcript.map((item, i) => (
            <TranscriptBubble key={item.id} item={item} index={i} />
          ))}
          {(isProcessing ||
            (isStreaming && !transcript[transcript.length - 1]?.text)) && (
            <TypingDots />
          )}
        </ScrollView>

        {/* Footer Controls */}
        <View style={styles.footer}>
          <TouchableOpacity
            onPressIn={startRecording}
            onPressOut={stopRecording}
            activeOpacity={0.8}
            disabled={isProcessing || isStreaming}
          >
            <View
              style={[
                styles.micContainer,
                (isProcessing || isStreaming) && { opacity: 0.5 },
              ]}
            >
              {isRecording && (
                <>
                  <Animated.View style={[styles.pulse, animatedPulseStyle1]} />
                  <Animated.View style={[styles.pulse, animatedPulseStyle2]} />
                </>
              )}
              <LinearGradient
                colors={
                  isRecording ? ["#ef4444", "#dc2626"] : ["#6366f1", "#a855f7"]
                }
                style={[
                  styles.micButton,
                  isRecording && styles.micButtonRecording,
                ]}
              >
                <Ionicons
                  name={isRecording ? "stop" : "mic"}
                  size={28}
                  color="white"
                />
              </LinearGradient>
            </View>
          </TouchableOpacity>
          <Text style={styles.hintText}>
            {isProcessing
              ? "Thinking..."
              : isStreaming
                ? "Maya is speaking..."
                : isRecording
                  ? "Listening..."
                  : "Hold to Speak"}
          </Text>
          <View style={styles.statePillsRow}>
            <View style={[styles.statePill, isRecording && styles.statePillActive]}>
              <Text style={styles.statePillText}>Listening</Text>
            </View>
            <View style={[styles.statePill, isProcessing && styles.statePillActive]}>
              <Text style={styles.statePillText}>Thinking</Text>
            </View>
            <View style={[styles.statePill, isStreaming && styles.statePillActive]}>
              <Text style={styles.statePillText}>Speaking</Text>
            </View>
          </View>
          {__DEV__ && (
            <View style={styles.debugBadge}>
              <Text style={styles.debugBadgeText}>
                stream: {streamPath} ({streamDebugReason}) • vad: {resolveVadProvider()}
              </Text>
              <Text style={styles.debugBadgeText}>
                turnStart: {turnStartAtLabel} • firstChunk:{" "}
                {firstChunkLatencyMs === null ? "pending" : `${firstChunkLatencyMs}ms`}
              </Text>
              <LatencyTimelinePanel
                trace={latencyTrace}
                extra={turnTraceIdRef.current ?? undefined}
              />
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    background: { ...StyleSheet.absoluteFillObject },
    safeArea: { flex: 1 },
    header: { flexDirection: "row", alignItems: "center", padding: 16 },
    backBtn: { padding: 8 },
    headerCenter: {
      flexDirection: "row",
      alignItems: "center",
      marginLeft: 10,
      gap: 8,
    },
    onlineBadge: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#10b981",
      shadowColor: "#10b981",
      shadowOpacity: 0.6,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 0 },
    },
    headerTitle: {
      color: theme.colors.text.primary,
      fontWeight: "bold",
      fontSize: 18,
      letterSpacing: 0.5,
    },
    endSessionBtn: {
      backgroundColor: `${theme.colors.error}20`,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: `${theme.colors.error}60`,
    },
    endSessionText: { color: theme.colors.error, fontWeight: "600", fontSize: 13 },
    transcriptScroll: { flex: 1 },
    transcriptContent: { padding: 16, gap: 16, paddingBottom: 100 },

    // Bubbles
    bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
    bubbleRowLeft: { justifyContent: "flex-start" },
    bubbleRowRight: { justifyContent: "flex-end" },
    avatarContainer: { position: "relative", width: 32, height: 32 },
    userAvatarContainer: { position: "relative", width: 32, height: 32 },
    avatarGlow: {
      position: "absolute",
      top: -4,
      left: -4,
      right: -4,
      bottom: -4,
      borderRadius: 20,
      backgroundColor: "#a855f7",
      opacity: 0.4,
    },
    miniAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
    },
    miniAvatarText: { color: "white", fontWeight: "bold", fontSize: 14 },
    bubbleWrapper: {
      maxWidth: SCREEN_WIDTH * 0.72,
      borderRadius: 20,
      overflow: "hidden",
    },
    bubbleWrapperUser: {
      borderBottomRightRadius: 4,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
    },
    bubbleWrapperPartner: {
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.15)",
    },
    bubble: { paddingHorizontal: 16, paddingVertical: 12 },
    bubbleUser: { backgroundColor: theme.colors.primary },
    bubblePartner: { backgroundColor: `${theme.colors.surface}DD` },
    bubbleText: {
      color: "white",
      fontSize: 16,
      lineHeight: 24,
      letterSpacing: 0.2,
    },
    bubbleTextUser: { color: "white" },
    bubbleTextPartner: { color: theme.colors.text.primary },

    // Footer
    footer: { alignItems: "center", paddingBottom: 40 },
    micContainer: {
      width: 80,
      height: 80,
      justifyContent: "center",
      alignItems: "center",
    },
    micButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: "center",
      alignItems: "center",
      zIndex: 2,
      shadowColor: "#a855f7",
      shadowOpacity: 0.4,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 10,
    },
    micButtonRecording: {
      shadowColor: "#ef4444",
      shadowOpacity: 0.6,
      shadowRadius: 15,
    },
    pulse: {
      position: "absolute",
      width: "100%",
      height: "100%",
      borderRadius: 40,
      backgroundColor: "rgba(239, 68, 68, 0.4)",
    },
    hintText: {
      color: theme.colors.text.secondary,
      marginTop: 16,
      fontSize: 14,
      fontWeight: "500",
      letterSpacing: 0.5,
    },
    statePillsRow: {
      marginTop: 8,
      flexDirection: "row",
      gap: 8,
    },
    statePill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: `${theme.colors.border}`,
      backgroundColor: `${theme.colors.surface}CC`,
    },
    statePillActive: {
      backgroundColor: `${theme.colors.primary}22`,
      borderColor: `${theme.colors.primary}80`,
    },
    statePillText: {
      fontSize: 11,
      fontWeight: "700",
      color: theme.colors.text.secondary,
    },
    debugBadge: {
      marginTop: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "rgba(250, 204, 21, 0.5)",
      backgroundColor: "rgba(250, 204, 21, 0.12)",
    },
    debugBadgeText: {
      color: "#fde68a",
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.2,
    },

    // Typing
    typingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginLeft: 8,
    },
    typingBubble: {
      flexDirection: "row",
      gap: 5,
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderRadius: 20,
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.1)",
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "rgba(255,255,255,0.8)",
    },
  });
