import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { useUser } from "@clerk/clerk-expo";
import * as FileSystem from "expo-file-system/legacy";
import { useAppTheme } from "../../../theme/useAppTheme";
import { bridgeApi } from "../../../api/bridgeApi";
import {
  streamingTutor,
  type StreamChunk,
} from "../../call/services/streamingTutorService";
import {
  ENGLIVO_AI_ASSISTANT_NAME,
  ENGLIVO_AI_EMPTY_HINT,
  ENGLIVO_AI_SPEAKING_LABEL,
  ENGLIVO_AI_TUTOR_TITLE,
} from "../constants";

type VoiceLoopState = "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING" | "ENDED";

type TutorMessage = {
  role: "user" | "assistant";
  content: string;
  audioBase64?: string;
  timestamp: number;
};

export default function AiConversationScreen({ navigation }: any) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const { user } = useUser();

  const [loopState, setLoopState] = useState<VoiceLoopState>("IDLE");
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [sessionStartTime] = useState(() => Date.now());

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const sessionIdRef = useRef<string>(`pulse-${Date.now()}`);

  // Breathing animation for mic
  const micScale = useSharedValue(1);
  const micOpacity = useSharedValue(1);

  const cefrSyncTriggeredRef = useRef(false);
  const requestIdRef = useRef(0);

  const syncCefrLevelOnce = async () => {
    if (cefrSyncTriggeredRef.current) return;
    cefrSyncTriggeredRef.current = true;

    const clerkId = user?.id;
    if (!clerkId) return;

    try {
      await bridgeApi.syncCefrLevel({ clerkId });
    } catch (e) {
      console.warn("[AiConversation] bridgeApi.syncCefrLevel failed:", e);
    }
  };

  const micAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }],
    opacity: micOpacity.value,
  }));

  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Microphone Permission",
          "Microphone access is required for AI conversations.",
        );
        navigation.goBack();
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
    })();

    return () => {
      cleanupAudio();
      streamingTutor.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const uid = (user?.id || "").trim() || "anonymous";
    const sid = sessionIdRef.current;

    const onStreamMessage = (chunk: StreamChunk) => {
      if (chunk.type === "error" || chunk.type === "timeout") {
        setLoopState("IDLE");
        return;
      }

      if ((chunk.type === "transcript" || chunk.type === "transcription") && chunk.text) {
        setMessages((prev) => [
          ...prev,
          { role: "user", content: chunk.text || "", timestamp: Date.now() },
        ]);
        return;
      }

      if (chunk.type === "sentence") {
        if (chunk.text) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && loopState === "SPEAKING") {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...last,
                content: `${last.content} ${chunk.text}`.trim(),
              };
              return updated;
            }
            return [
              ...prev,
              {
                role: "assistant",
                content: chunk.text ?? "",
                timestamp: Date.now(),
                audioBase64: chunk.audio,
              },
            ];
          });
        }
        if (chunk.audio) {
          queueAudio(chunk.audio);
        }
        return;
      }

      if (chunk.type === "done") {
        if (audioQueueRef.current.length === 0 && !isPlayingRef.current) {
          setLoopState("LISTENING");
          void startListening();
        }
      }
    };

    streamingTutor.connect(sid, uid);
    streamingTutor.onMessage(onStreamMessage);
    return () => {
      streamingTutor.offMessage(onStreamMessage);
    };
    // We intentionally keep one WS session for this screen lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (loopState === "LISTENING") {
      micScale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        true,
      );
      micOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        true,
      );
    } else {
      micScale.value = withTiming(1, { duration: 200 });
      micOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [loopState, micOpacity, micScale]);

  const cleanupAudio = async () => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (_) {}
      recordingRef.current = null;
    }
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch (_) {}
      soundRef.current = null;
    }
  };

  const queueAudio = (base64: string) => {
    audioQueueRef.current.push(base64);
    void playNextQueuedAudio();
  };

  const playNextQueuedAudio = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    const next = audioQueueRef.current.shift();
    if (!next) return;
    isPlayingRef.current = true;
    setLoopState("SPEAKING");
    await playAudio(next);
    isPlayingRef.current = false;
    if (audioQueueRef.current.length > 0) {
      await playNextQueuedAudio();
      return;
    }
    setLoopState("LISTENING");
    await startListening();
  };

  const startListening = async () => {
    setLoopState("LISTENING");
    try {
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
    } catch (e) {
      console.error("[AiConversation] Recording start error:", e);
      setLoopState("IDLE");
    }
  };

  const stopAndProcess = async () => {
    if (!recordingRef.current) return;
    setLoopState("PROCESSING");

    let uri: string | null = null;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      uri = recordingRef.current.getURI();
      recordingRef.current = null;
    } catch (e) {
      console.error("[AiConversation] Stop recording error:", e);
      setLoopState("IDLE");
      return;
    }

    if (!uri) {
      setLoopState("IDLE");
      return;
    }

    try {
      // Pulse path: send raw audio to streaming tutor WS.
      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });
      const rid = ++requestIdRef.current;
      if (__DEV__) console.log("[AiConversation] sending audio turn", { rid, size: audioBase64.length });
      streamingTutor.sendText(null, null, audioBase64);
    } catch (e: any) {
      console.error("[AiConversation] Pipeline error:", e);
      setLoopState("IDLE");
    }
  };

  const playAudio = async (base64: string): Promise<void> => {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    return new Promise(async (resolve) => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });

        const { sound } = await Audio.Sound.createAsync(
          { uri: `data:audio/mp3;base64,${base64}` },
          { shouldPlay: true },
        );

        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            sound.unloadAsync();
            soundRef.current = null;
            Audio.setAudioModeAsync({
              allowsRecordingIOS: true,
              playsInSilentModeIOS: true,
            });
            resolve();
          }
        });
      } catch (e) {
        console.error("[AiConversation] Playback error:", e);
        resolve();
      }
    });
  };

  const handleMicPress = () => {
    if (loopState === "IDLE") startListening();
    else if (loopState === "LISTENING") stopAndProcess();
  };

  const handleEndSession = async () => {
    await cleanupAudio();
    setLoopState("ENDED");

    await syncCefrLevelOnce();

    const durationSeconds = Math.round(
      (Date.now() - sessionStartTime) / 1000,
    );
    navigation.navigate("EnglivoActiveCall", {
      messages,
      durationSeconds,
    });
  };

  const getMicLabel = () => {
    switch (loopState) {
      case "IDLE":
        return "Tap to Start";
      case "LISTENING":
        return "Listening... Tap to Stop";
      case "PROCESSING":
        return "Processing...";
      case "SPEAKING":
        return ENGLIVO_AI_SPEAKING_LABEL;
      case "ENDED":
        return "Session Ended";
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={theme.colors.text.primary}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{ENGLIVO_AI_TUTOR_TITLE}</Text>
        <TouchableOpacity style={styles.endButton} onPress={handleEndSession}>
          <Text style={styles.endButtonText}>End</Text>
        </TouchableOpacity>
      </View>

      {/* Transcript */}
      <ScrollView
        ref={scrollRef}
        style={styles.transcript}
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: true })
        }
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && (
          <View style={styles.emptyHint}>
            <Ionicons
              name="mic-outline"
              size={40}
              color={theme.colors.text.light}
            />
            <Text style={styles.emptyHintText}>{ENGLIVO_AI_EMPTY_HINT}</Text>
          </View>
        )}

        {messages.map((msg, idx) => (
          <View
            key={idx}
            style={[
              styles.bubble,
              msg.role === "user" ? styles.bubbleUser : styles.bubbleAssistant,
            ]}
          >
            <Text
              style={
                msg.role === "user"
                  ? styles.bubbleTextUser
                  : styles.bubbleTextAssistant
              }
            >
              {msg.content}
            </Text>
          </View>
        ))}

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Mic Control */}
      <View style={styles.controls}>
        <Text style={styles.stateLabel}>{getMicLabel()}</Text>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleMicPress}
          disabled={
            loopState === "PROCESSING" ||
            loopState === "SPEAKING" ||
            loopState === "ENDED"
          }
        >
          <Animated.View style={[styles.micOuter, micAnimStyle]}>
            <LinearGradient
              colors={
                loopState === "LISTENING"
                  ? (["#F87171", "#EF4444"] as any)
                  : (theme.colors.gradients.primary as any)
              }
              style={styles.micInner}
            >
              <Ionicons
                name={loopState === "LISTENING" ? "stop" : "mic"}
                size={36}
                color="#0F172A"
              />
            </LinearGradient>
          </Animated.View>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </View>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.m,
      paddingVertical: theme.spacing.s,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTitle: {
      fontSize: theme.typography.sizes.m,
      fontWeight: "bold",
      color: theme.colors.text.primary,
    },
    endButton: {
      backgroundColor: "#F87171",
      paddingHorizontal: theme.spacing.m,
      paddingVertical: 6,
      borderRadius: theme.borderRadius.m,
    },
    endButtonText: {
      color: "#fff",
      fontWeight: "bold",
      fontSize: theme.typography.sizes.s,
    },
    transcript: { flex: 1, padding: theme.spacing.m },
    emptyHint: {
      flex: 1,
      alignItems: "center",
      paddingTop: theme.spacing.xxl,
      gap: theme.spacing.m,
    },
    emptyHintText: {
      color: theme.colors.text.light,
      fontSize: theme.typography.sizes.m,
      textAlign: "center",
      lineHeight: 22,
    },
    bubble: {
      maxWidth: "80%",
      padding: theme.spacing.m,
      borderRadius: theme.borderRadius.l,
      marginBottom: theme.spacing.s,
    },
    bubbleUser: {
      alignSelf: "flex-end",
      backgroundColor: theme.colors.primary,
      borderBottomRightRadius: 4,
    },
    bubbleAssistant: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.surface,
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    bubbleTextUser: {
      color: "#0F172A",
      fontSize: theme.typography.sizes.m,
    },
    bubbleTextAssistant: {
      color: theme.colors.text.primary,
      fontSize: theme.typography.sizes.m,
    },
    controls: {
      alignItems: "center",
      paddingBottom: theme.spacing.l,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingTop: theme.spacing.l,
    },
    stateLabel: {
      fontSize: theme.typography.sizes.s,
      color: theme.colors.text.light,
      marginBottom: theme.spacing.l,
    },
    micOuter: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: `${theme.colors.primary}30`,
      justifyContent: "center",
      alignItems: "center",
      ...theme.shadows.primaryGlow,
    },
    micInner: {
      width: 72,
      height: 72,
      borderRadius: 36,
      justifyContent: "center",
      alignItems: "center",
    },
  });

