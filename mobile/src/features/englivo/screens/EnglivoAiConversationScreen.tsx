import React, { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useAppTheme } from "../../../theme/useAppTheme";
import { sendMessage, textToSpeech, transcribeAudio } from "../../../api/englivo/aiTutor";
import { TutorMessage, VoiceLoopState } from "../../../types/aiTutor";

export default function EnglivoAiConversationScreen({ navigation }: any) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const [loopState, setLoopState] = useState<VoiceLoopState>("IDLE");
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [sessionStartTime] = useState(() => Date.now());

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const micScale = useSharedValue(1);
  const micOpacity = useSharedValue(1);
  const micAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: micScale.value }], opacity: micOpacity.value }));

  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Microphone Permission", "Microphone access is required.");
        navigation.goBack();
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    })();
  }, [navigation]);

  useEffect(() => {
    if (loopState === "LISTENING") {
      micScale.value = withRepeat(withSequence(withTiming(1.2, { duration: 600 }), withTiming(1, { duration: 600 })), -1, true);
      micOpacity.value = withRepeat(withSequence(withTiming(0.7, { duration: 600 }), withTiming(1, { duration: 600 })), -1, true);
    } else {
      micScale.value = withTiming(1, { duration: 200 });
      micOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [loopState, micOpacity, micScale]);

  const startListening = async () => {
    setLoopState("LISTENING");
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    recordingRef.current = recording;
  };

  const playAudio = async (base64: string) => {
    if (soundRef.current) await soundRef.current.unloadAsync();
    const { sound } = await Audio.Sound.createAsync({ uri: `data:audio/mp3;base64,${base64}` }, { shouldPlay: true });
    soundRef.current = sound;
    return new Promise<void>((resolve) => {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) resolve();
      });
    });
  };

  const stopAndProcess = async () => {
    if (!recordingRef.current) return;
    setLoopState("PROCESSING");
    await recordingRef.current.stopAndUnloadAsync();
    const uri = recordingRef.current.getURI();
    recordingRef.current = null;
    if (!uri) return setLoopState("IDLE");

    const formData = new FormData();
    formData.append("audio", { uri, type: "audio/m4a", name: "recording.m4a" } as any);
    const { transcript } = await transcribeAudio(formData);
    if (!transcript?.trim()) return setLoopState("IDLE");

    const userMsg: TutorMessage = { role: "user", content: transcript, timestamp: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    const { reply, audioBase64 } = await sendMessage({ message: transcript, history: updated.map((m) => ({ role: m.role, content: m.content })) });
    const tts = audioBase64 || (await textToSpeech({ text: reply })).audioBase64;
    setMessages((prev) => [...prev, { role: "assistant", content: reply, audioBase64: tts, timestamp: Date.now() }]);
    if (tts) {
      setLoopState("SPEAKING");
      await playAudio(tts);
    }
    await startListening();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Tutor - Priya</Text>
        <TouchableOpacity
          style={styles.endButton}
          onPress={() =>
            navigation.navigate("EnglivoActiveCall", {
              messages,
              durationSeconds: Math.round((Date.now() - sessionStartTime) / 1000),
            })
          }
        >
          <Text style={styles.endButtonText}>End</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} style={styles.transcript} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {messages.map((msg, idx) => (
          <View key={idx} style={[styles.bubble, msg.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
            <Text style={msg.role === "user" ? styles.bubbleTextUser : styles.bubbleTextAssistant}>{msg.content}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.controls}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => (loopState === "IDLE" ? startListening() : stopAndProcess())}
          disabled={loopState === "PROCESSING" || loopState === "SPEAKING" || loopState === "ENDED"}
        >
          <Animated.View style={[styles.micOuter, micAnimStyle]}>
            <LinearGradient colors={theme.colors.gradients.primary as any} style={styles.micInner}>
              <Ionicons name={loopState === "LISTENING" ? "stop" : "mic"} size={36} color="#0F172A" />
            </LinearGradient>
          </Animated.View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.spacing.m, paddingVertical: theme.spacing.s, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    headerTitle: { fontSize: theme.typography.sizes.m, fontWeight: "bold", color: theme.colors.text.primary },
    endButton: { backgroundColor: "#F87171", paddingHorizontal: theme.spacing.m, paddingVertical: 6, borderRadius: theme.borderRadius.m },
    endButtonText: { color: "#fff", fontWeight: "bold", fontSize: theme.typography.sizes.s },
    transcript: { flex: 1, padding: theme.spacing.m },
    bubble: { maxWidth: "80%", padding: theme.spacing.m, borderRadius: theme.borderRadius.l, marginBottom: theme.spacing.s },
    bubbleUser: { alignSelf: "flex-end", backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 },
    bubbleAssistant: { alignSelf: "flex-start", backgroundColor: theme.colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.colors.border },
    bubbleTextUser: { color: "#0F172A", fontSize: theme.typography.sizes.m },
    bubbleTextAssistant: { color: theme.colors.text.primary, fontSize: theme.typography.sizes.m },
    controls: { alignItems: "center", paddingBottom: theme.spacing.l, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: theme.spacing.l },
    micOuter: { width: 88, height: 88, borderRadius: 44, backgroundColor: `${theme.colors.primary}30`, justifyContent: "center", alignItems: "center" },
    micInner: { width: 72, height: 72, borderRadius: 36, justifyContent: "center", alignItems: "center" },
  });
