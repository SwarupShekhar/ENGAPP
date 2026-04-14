/**
 * EnglivoLiveCallScreen — Core side live tutor session via LiveKit.
 *
 * Used for both:
 *  1. Instant "Call a Tutor Now" (token from /api/livekit/token)
 *  2. Joining a booked session (token from /api/sessions/:id/join)
 *
 * Keeps it simple: audio-first, clean dark UI matching Core "Gold Standard" aesthetic.
 * No STT/transcription — that's Pulse's job.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { postCallEnd } from "../../../api/englivo/quota";
import {
  LiveKitRoom,
  useTracks,
} from "@livekit/react-native";
import { Track } from "livekit-client";

// ─── Constants ───────────────────────────────────────────────────────────────

// Core LiveKit cloud project (NEXT_PUBLIC_LIVEKIT_URL from englivo.com).
const ENGLIVO_LIVEKIT_URL = "wss://ssengst-174tfe9o.livekit.cloud";

const C = {
  void: "#080C14",
  card: "#111827",
  cardBorder: "#1E2D45",
  goldBright: "#F5C842",
  goldMid: "#E8A020",
  goldDeep: "#B8730A",
  ash: "#8B9AB0",
  white: "#F4F6FA",
  red: "#F87171",
  green: "#34D399",
};

// ─── Timer ────────────────────────────────────────────────────────────────────

function useCallTimer() {
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    ref.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, []);

  const formatted = (() => {
    const m = Math.floor(elapsed / 60).toString().padStart(2, "0");
    const s = (elapsed % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  })();

  return { elapsed, formatted };
}

// ─── Inner Room Component ─────────────────────────────────────────────────────

function CallRoomInner({
  tutorName,
  freeMinutesRemaining,
  onEnd,
}: {
  tutorName: string;
  freeMinutesRemaining?: number;
  onEnd: () => void;
}) {
  const { formatted, elapsed } = useCallTimer();
  const [isMuted, setIsMuted] = useState(false);
  const [connected, setConnected] = useState(false);

  // Show free time warning at 2 minutes remaining
  const freeSecondsTotal = (freeMinutesRemaining ?? 0) * 60;
  const freeSecondsRemaining = freeSecondsTotal - elapsed;
  const showFreeTimeWarning =
    freeSecondsTotal > 0 && freeSecondsRemaining > 0 && freeSecondsRemaining <= 120;

  const tracks = useTracks([
    { source: Track.Source.Microphone, withPlaceholder: true },
  ]);

  useEffect(() => {
    // Short delay to let the room settle before marking connected
    const t = setTimeout(() => setConnected(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Auto-end when free time expires
  useEffect(() => {
    if (freeSecondsTotal > 0 && elapsed >= freeSecondsTotal) {
      Alert.alert(
        "Free time used",
        "Your complimentary 10-minute session has ended.",
        [{ text: "OK", onPress: onEnd }],
      );
    }
  }, [elapsed, freeSecondsTotal, onEnd]);

  return (
    <View style={styles.roomContainer}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={[styles.liveDot, { backgroundColor: connected ? C.green : C.ash }]} />
        <Text style={styles.timerText}>{formatted}</Text>
        {freeSecondsTotal > 0 && (
          <View style={styles.freePill}>
            <Text style={styles.freePillText}>
              {Math.max(0, Math.ceil(freeSecondsRemaining / 60))}m free
            </Text>
          </View>
        )}
      </View>

      {/* Free time warning */}
      {showFreeTimeWarning && (
        <View style={styles.freeTimeWarning}>
          <Ionicons name="warning-outline" size={14} color={C.goldBright} />
          <Text style={styles.freeTimeWarningText}>
            {Math.ceil(freeSecondsRemaining / 60)} minute{Math.ceil(freeSecondsRemaining / 60) !== 1 ? "s" : ""} of free time remaining
          </Text>
        </View>
      )}

      {/* Tutor avatar area */}
      <View style={styles.avatarArea}>
        <View style={styles.tutorAvatar}>
          <Ionicons name="person" size={48} color={C.goldMid} />
        </View>
        <Text style={styles.tutorName}>{tutorName || "Tutor"}</Text>
        <Text style={styles.statusText}>
          {connected ? "Connected" : "Connecting..."}
        </Text>

        {/* Audio visualizer placeholder */}
        <View style={styles.waveRow}>
          {[3, 6, 9, 12, 9, 6, 3].map((h, i) => (
            <View
              key={i}
              style={[
                styles.waveBar,
                { height: connected ? h + Math.random() * 6 : h },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Mute */}
        <TouchableOpacity
          style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
          onPress={() => setIsMuted((m) => !m)}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isMuted ? "mic-off" : "mic"}
            size={24}
            color={isMuted ? C.void : C.white}
          />
        </TouchableOpacity>

        {/* End call */}
        <TouchableOpacity
          style={styles.endCallBtn}
          onPress={() => {
            Alert.alert("End Call", "Are you sure you want to end this session?", [
              { text: "Cancel", style: "cancel" },
              { text: "End", style: "destructive", onPress: onEnd },
            ]);
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="call" size={28} color={C.white} style={{ transform: [{ rotate: "135deg" }] }} />
        </TouchableOpacity>

        {/* Speaker (placeholder — LiveKit manages audio routing) */}
        <TouchableOpacity style={styles.controlBtn} activeOpacity={0.8}>
          <Ionicons name="volume-high" size={24} color={C.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function EnglivoLiveCallScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();

  const {
    token,
    roomName,
    tutorName = "Your Tutor",
    serverUrl,
    freeMinutesRemaining,
  } = route.params ?? {};

  const sessionIdRef = useRef<string>(`session-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const callStartRef = useRef<number>(Date.now());

  useEffect(() => {
    return () => {
      const durationSeconds = Math.floor((Date.now() - callStartRef.current) / 1000);
      if (durationSeconds > 0) {
        postCallEnd(sessionIdRef.current, durationSeconds);
      }
    };
  }, []);

  const livekitUrl = serverUrl || ENGLIVO_LIVEKIT_URL;

  const handleEnd = useCallback(() => {
    navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
  }, [navigation]);

  if (!token || !roomName) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Ionicons name="warning-outline" size={40} color={C.goldMid} />
        <Text style={[styles.tutorName, { marginTop: 16, textAlign: "center" }]}>
          Session token missing.{"\n"}Please try again.
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.retryBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["bottom"]} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.void} />
      <LiveKitRoom
        serverUrl={livekitUrl}
        token={token}
        connect
        audio
        video={false}
        onDisconnected={handleEnd}
        onError={(err) => {
          console.error("[EnglivoLiveCall] LiveKit error:", err);
          Alert.alert("Connection Error", "Lost connection to session.", [
            { text: "OK", onPress: handleEnd },
          ]);
        }}
      >
        <CallRoomInner
          tutorName={tutorName}
          freeMinutesRemaining={freeMinutesRemaining}
          onEnd={handleEnd}
        />
      </LiveKitRoom>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.void,
  },
  roomContainer: {
    flex: 1,
    paddingHorizontal: 24,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingTop: Platform.OS === "android" ? 16 : 12,
    paddingBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timerText: {
    fontSize: 18,
    fontWeight: "700",
    color: C.white,
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
  freePill: {
    backgroundColor: C.goldDeep + "33",
    borderWidth: 0.5,
    borderColor: C.goldMid,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  freePillText: {
    fontSize: 11,
    fontWeight: "700",
    color: C.goldBright,
    letterSpacing: 0.5,
  },
  freeTimeWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.goldDeep + "22",
    borderWidth: 0.5,
    borderColor: C.goldMid + "60",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
  },
  freeTimeWarningText: {
    fontSize: 13,
    color: C.goldBright,
    fontWeight: "600",
  },
  avatarArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  tutorAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.goldMid + "50",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: C.goldMid,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
    }),
  },
  tutorName: {
    fontSize: 24,
    fontWeight: "700",
    color: C.white,
    letterSpacing: -0.3,
  },
  statusText: {
    fontSize: 13,
    color: C.ash,
    fontWeight: "500",
  },
  waveRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    height: 24,
    marginTop: 8,
  },
  waveBar: {
    width: 4,
    backgroundColor: C.goldMid + "80",
    borderRadius: 2,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    paddingBottom: 40,
    paddingTop: 16,
  },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnActive: {
    backgroundColor: C.white,
    borderColor: C.white,
  },
  endCallBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#DC2626",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.5,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  retryBtn: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: C.goldMid,
    borderRadius: 12,
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: C.void,
  },
});
