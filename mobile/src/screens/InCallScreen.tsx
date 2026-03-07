import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useUser } from "@clerk/clerk-expo";
import {
  LiveKitRoom,
  useTracks,
  useRoomContext,
  TrackReferenceOrPlaceholder,
} from "@livekit/react-native";
import { Track, RoomEvent } from "livekit-client";
import { io, Socket } from "socket.io-client";
import SocketService from "../services/socketService";
import { useAppTheme } from "../theme/useAppTheme";
import { livekitApi } from "../api/livekit";
import { sessionsApi } from "../api/sessions";
import { API_URL } from "../api/client";
import { Buffer } from "buffer";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
// In a real app, these would come from environment variables
const LIVEKIT_URL = "wss://engrapp-8lz8v8ia.livekit.cloud";

// Restart STT before engine hard-stops (~60s on most engines)
const STT_MAX_DURATION_MS = 50000;

// ─── Data & Transcription Listener Component ───────────────────────────────
function DataListener({
  onTranscription,
  onEndSession,
  setRoomRef,
}: {
  onTranscription: (data: any) => void;
  onEndSession: () => void;
  setRoomRef?: (room: any) => void;
}) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const room = useRoomContext();

  useEffect(() => {
    setRoomRef?.(room);
  }, [room, setRoomRef]);

  useEffect(() => {
    const handleData = (payload: Uint8Array) => {
      try {
        const str = Buffer.from(payload).toString("utf-8");
        const data = JSON.parse(str);
        // Custom data signals
        if (data.type === "end_session") {
          console.log("[LiveKit] Received end_session signal");
          onEndSession();
        } else if (data.type === "transcription" && data.text?.trim?.()) {
          if (__DEV__) {
            console.log("[LiveKit] Received remote transcription:", (data.text || "").slice(0, 40) + "...");
          }
          onTranscription({
            userId: data.userId,
            text: (data.text || "").trim(),
            fromRemote: true,
          });
        } else {
          console.log("[LiveKit] Received data packet:", data);
        }
      } catch (e) {
        // Ignore parse errors (might be raw binary data or malformed JSON)
      }
    };

    const handleTranscription = (segments: any[]) => {
      if (!segments || segments.length === 0) return;

      segments.forEach((segment) => {
        if (segment.isFinal) {
          // Some versions use speakerIdentity, others use participant.identity
          const speakerId =
            segment.speakerIdentity || segment.participant?.identity;
          if (speakerId) {
            onTranscription({
              userId: speakerId,
              text: segment.text,
            });
          }
        }
      });
    };

    const handleParticipantDisconnected = () => {
      console.log("[LiveKit] Remote participant disconnected");
      onEndSession();
    };

    // Listen for raw data messages (like end_session)
    room.on(RoomEvent.DataReceived, handleData);
    // Listen for native SIP/Deepgram LiveKit STT transcriptions
    room.on(RoomEvent.TranscriptionReceived, handleTranscription);
    // Peer disconnected - end the call locally
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);

    return () => {
      room.off(RoomEvent.DataReceived, handleData);
      room.off(RoomEvent.TranscriptionReceived, handleTranscription);
      room.off(
        RoomEvent.ParticipantDisconnected,
        handleParticipantDisconnected,
      );
    };
  }, [room, onTranscription, onEndSession]);

  return null;
}

// ─── Room Handler Component ────────────────────────────────
function RoomHandler({
  onRoomReady,
  onReconnected,
}: {
  onRoomReady: (room: any) => void;
  onReconnected?: (room: any) => void;
}) {
  const room = useRoomContext();
  useEffect(() => {
    onRoomReady(room);
    if (onReconnected) {
      const handler = () => onReconnected(room);
      room.on(RoomEvent.Reconnected, handler);
      return () => {
        room.off(RoomEvent.Reconnected, handler);
      };
    }
  }, [room, onRoomReady, onReconnected]);
  return null;
}

// ─── Audio Conference Component ────────────────────────────
function AudioConference() {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const tracks = useTracks([Track.Source.Microphone]);
  return (
    <View style={{ display: "none" }}>
      {tracks.map((track) => (
        <View key={track.publication.trackSid} />
      ))}
    </View>
  );
}

// ─── Initial Transcript State ────────────────────────────────
const INITIAL_TRANSCRIPT: any[] = [];

// ─── Transcription Status Indicator ───────────────────────
function TranscriptionStatus({
  status,
}: {
  status: "idle" | "active" | "error" | "unavailable";
}) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  return (
    <View style={styles.transcriptionStatus}>
      <View
        style={[
          styles.statusDot,
          status === "active"
            ? styles.statusDotActive
            : status === "error"
              ? styles.statusDotError
              : styles.statusDotIdle,
        ]}
      />
      <Text style={styles.statusTextMini}>
        {status === "active"
          ? "Live Transcribing..."
          : status === "error"
            ? "Transcription Error"
            : status === "unavailable"
              ? "Transcription Unavailable"
              : "Initializing STT..."}
      </Text>
    </View>
  );
}

// ─── Transcript Bubble ────────────────────────────────────
function TranscriptBubble({
  item,
  index,
  partnerName,
  isPartnerBot,
}: {
  item: any;
  index: number;
  partnerName: string;
  isPartnerBot?: boolean;
}) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const isUser = item.speaker === "user";
  const speakerLabel = isUser ? "You" : partnerName || "Partner";
  return (
    <Animated.View
      entering={FadeInUp.delay(Math.min(index * 50, 300)).springify()}
      style={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowRight : styles.bubbleRowLeft,
      ]}
    >
      {!isUser && (
        <View
          style={[
            styles.miniAvatar,
            {
              backgroundColor: isPartnerBot
                ? theme.colors.primary
                : theme.colors.secondary,
            },
          ]}
        >
          <Text style={styles.miniAvatarText}>
            {(partnerName || "P").charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubblePartner,
        ]}
      >
        <Text
          style={[
            styles.bubbleLabel,
            isUser ? styles.bubbleLabelUser : styles.bubbleLabelPartner,
          ]}
        >
          {speakerLabel}
        </Text>
        <Text
          style={[
            styles.bubbleText,
            isUser ? styles.bubbleTextUser : styles.bubbleTextPartner,
          ]}
        >
          {item.text}
        </Text>
        <Text style={styles.bubbleTime}>{item.time}</Text>
      </View>
      {isUser && (
        <View
          style={[
            styles.miniAvatar,
            { backgroundColor: theme.colors.primaryLight },
          ]}
        >
          <Text
            style={[styles.miniAvatarText, { color: theme.colors.primary }]}
          >
            Y
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Control Button ───────────────────────────────────────
function ControlButton({
  icon,
  label,
  onPress,
  danger,
  active,
  secondary,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
  active?: boolean;
  secondary?: boolean;
}) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const iconColor =
    secondary && !active && !danger ? theme.colors.text.primary : "white";
  return (
    <TouchableOpacity
      style={styles.controlButton}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.controlIcon,
          danger && styles.controlIconDanger,
          active && styles.controlIconActive,
          secondary && !active && styles.controlIconSecondary,
        ]}
      >
        <Ionicons name={icon as any} size={22} color={iconColor} />
      </View>
      <Text style={styles.controlLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Component ───────────────────────────────────────
export default function InCallScreen({ navigation, route }: any) {
  const theme = useAppTheme();
  const styles = getStyles(theme);
  const { user } = useUser();
  const [token, setToken] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [transcript, setTranscript] = useState<any[]>(INITIAL_TRANSCRIPT);
  const scrollRef = useRef<ScrollView>(null);
  const durationRef = useRef(0);
  const transcriptRef = useRef<any[]>(INITIAL_TRANSCRIPT);
  const roomRef = useRef<any>(null);
  const hasEndedRef = useRef(false);
  const joinTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sttRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const socketRef = useRef<Socket | null>(null);

  const insets = useSafeAreaInsets();
  const [sessionId, setSessionId] = useState(route?.params?.sessionId);
  const partnerName = route?.params?.partnerName || "Co-learner";
  const topic = route?.params?.topic || "General Practice";
  const isDirect = route?.params?.isDirect;
  const isCaller = route?.params?.isCaller ?? false;
  const conversationId = useRef(
    route?.params?.conversationId || route?.params?.sessionId,
  ).current;

  // Sync refs with state for stable access in handleEndCall
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Only the caller waits. The receiver has already accepted.
  const [isWaiting, setIsWaiting] = useState(isDirect && isCaller);

  useEffect(() => {
    console.log(
      `[InCall] State Update: isWaiting=${isWaiting}, token=${!!token}, isMuted=${isMuted}, sessionId=${sessionId}`,
    );
  }, [isWaiting, token, isMuted, sessionId]);
  const [callStatus, setCallStatus] = useState<
    "calling" | "connected" | "declined"
  >("calling");

  const [transcriptionStatus, setTranscriptionStatus] = useState<
    "idle" | "active" | "error" | "unavailable"
  >("idle");
  const [roomReady, setRoomReady] = useState(false);
  const localSttActiveRef = useRef(false);
  const hasLiveKitSttRef = useRef(false);
  const hasScheduledLocalSTTRef = useRef(false);
  const hasRetriedLocalSTTRef = useRef(false);
  const lastLocalSTTStartRef = useRef(0);
  const isMutedRef = useRef(isMuted);
  const startRecognitionWithKeepaliveRef = useRef<() => void>(() => {});
  const startLocalSTTRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const startRecognitionWithKeepalive = useCallback(() => {
    if (hasEndedRef.current) {
      console.log("[LocalSTT] Skipping start (Ended)");
      return;
    }
    if (sttRestartTimerRef.current) {
      clearTimeout(sttRestartTimerRef.current);
      sttRestartTimerRef.current = null;
    }
    try {
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        // Let LiveKit manage the category; only set if strictly necessary
        iosCategory: {
          category: "playAndRecord",
          categoryOptions: [
            "defaultToSpeaker",
            "allowBluetooth",
            "mixWithOthers" as any,
          ],
          mode: "voiceChat",
        },
      });
      console.log("[LocalSTT] start() called successfully");
    } catch (e) {
      return;
    }
    sttRestartTimerRef.current = setTimeout(() => {
      sttRestartTimerRef.current = null;
      try {
        const prev = transcriptRef.current;
        const pending = prev.find((t) => t.id === "pending-local");
        if (pending?.text?.trim()) {
          const without = prev.filter((t) => t.id !== "pending-local");
          const next = [
            ...without,
            {
              id: `local-${Date.now()}`,
              speaker: "user",
              text: pending.text.trim(),
              time: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          ];
          transcriptRef.current = next;
          setTranscript(next);
        }
        ExpoSpeechRecognitionModule.stop();
      } catch (_) {}
    }, STT_MAX_DURATION_MS);
  }, []);
  startRecognitionWithKeepaliveRef.current = startRecognitionWithKeepalive;

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.15);

  // ─── On-device Speech Recognition (fallback when LiveKit STT is unavailable) ────
  useSpeechRecognitionEvent("start", () => {
    lastLocalSTTStartRef.current = Date.now();
    console.log(`[LocalSTT] Event: start. Status: ${transcriptionStatus}`);
    localSttActiveRef.current = true;
    setTranscriptionStatus("active");
  });

  useSpeechRecognitionEvent("end", () => {
    localSttActiveRef.current = false;
    const runDuration = Date.now() - lastLocalSTTStartRef.current;
    const isShortRun = runDuration < 2000;
    console.log(
      `[LocalSTT] Event: end. Duration: ${runDuration}ms (Short: ${isShortRun})`,
    );
    // Commit in-flight interim so we don't lose words at restart boundary
    const prev = transcriptRef.current;
    const pending = prev.find((t) => t.id === "pending-local");
    if (pending?.text?.trim()) {
      const without = prev.filter((t) => t.id !== "pending-local");
      const next = [
        ...without,
        {
          id: `local-${Date.now()}`,
          speaker: "user",
          text: pending.text.trim(),
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ];
      transcriptRef.current = next;
      setTranscript(next);
    }
    // Restart: back off if this was a short run (e.g. no-speech) to avoid tight loop
    if (!hasEndedRef.current && token && !isMutedRef.current) {
      const delay = isShortRun ? 2000 : 150;
      setTimeout(() => {
        if (
          !hasEndedRef.current &&
          !isMutedRef.current &&
          startRecognitionWithKeepaliveRef.current
        ) {
          startRecognitionWithKeepaliveRef.current();
        }
      }, delay);
    }
  });

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results?.[0]?.transcript?.trim() ?? "";
    console.log(
      `[LocalSTT] result event: "${transcript}" (isFinal: ${event.isFinal})`,
    );
    if (transcript.length === 0) return;

    if (event.isFinal) {
      console.log(`[LocalSTT] Final result: "${transcript}"`);

      const newItem = {
        id: `local-${Date.now()}`,
        speaker: "user" as const,
        text: transcript,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      const withoutPending = transcriptRef.current.filter((t) => t.id !== "pending-local");
      transcriptRef.current = [...withoutPending, newItem];
      setTranscript(transcriptRef.current);

      // 2. Broadcast to peer only when not muted (mic is on)
      const sendTranscript = () => {
        if (isMutedRef.current) return true;
        const r = roomRef.current;
        if (!r) return false;
        const signal = JSON.stringify({
          type: "transcription",
          userId: user?.id,
          text: transcript,
        });
        r.localParticipant
          .publishData(Buffer.from(signal), { reliable: true })
          .then(() => {
            if (__DEV__) console.log("[InCall] Broadcast local STT ok");
          })
          .catch((err: any) =>
            console.error("[InCall] Failed to broadcast local STT:", err),
          );
        return true;
      };
      if (!sendTranscript()) {
        if (__DEV__) console.warn("[InCall] No roomRef yet, retry broadcast in 200ms");
        setTimeout(() => sendTranscript(), 200);
      }
    } else {
      const pendingItem = {
        id: "pending-local",
        speaker: "user" as const,
        text: transcript,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      const withoutPending = transcriptRef.current.filter((t) => t.id !== "pending-local");
      transcriptRef.current = [...withoutPending, pendingItem];
      setTranscript(transcriptRef.current);
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    const isNoSpeech = event.error === "no-speech";
    if (isNoSpeech) {
      // Expected when user is silent; "end" will fire and we restart with backoff there
      return;
    }
    console.warn(`[LocalSTT] Error: ${event.error} - ${event.message}`);
    if (
      !hasLiveKitSttRef.current &&
      !hasEndedRef.current &&
      token &&
      !isWaiting
    ) {
      if (sttRestartTimerRef.current) {
        clearTimeout(sttRestartTimerRef.current);
        sttRestartTimerRef.current = null;
      }
      setTranscriptionStatus("idle");
      setTimeout(() => {
        if (!hasEndedRef.current && startRecognitionWithKeepaliveRef.current) {
          startRecognitionWithKeepaliveRef.current();
        } else if (!hasEndedRef.current) {
          setTranscriptionStatus("error");
        }
      }, 500);
    } else if (!hasLiveKitSttRef.current && !hasEndedRef.current) {
      setTranscriptionStatus("error");
    }
  });

  const startLocalSTT = useCallback(async () => {
    console.log(
      `[LocalSTT] startLocalSTT() called. token: ${!!token}, isMuted: ${isMuted}, hasEnded: ${hasEndedRef.current}`,
    );
    if (!token || hasEndedRef.current) {
      console.log("[LocalSTT] startLocalSTT() aborting due to state");
      return;
    }
    try {
      const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      console.log(`[LocalSTT] Permissions check: ${perms.granted}`);
      if (!perms.granted) {
        console.warn("[LocalSTT] Permissions not granted");
        setTranscriptionStatus("unavailable");
        return;
      }
      console.log("[LocalSTT] Calling startRecognitionWithKeepalive()...");
      setTranscriptionStatus("active");
      startRecognitionWithKeepalive();
    } catch (e) {
      console.error("[LocalSTT] Failed to start:", e);
      setTranscriptionStatus("unavailable");
    }
  }, [token, isWaiting, isMuted, startRecognitionWithKeepalive]);
  startLocalSTTRef.current = startLocalSTT;

  // Start Local STT when we have both token and room (same delay for both sides)
  useEffect(() => {
    if (!token || !roomReady || hasEndedRef.current || hasScheduledLocalSTTRef.current) return;
    hasScheduledLocalSTTRef.current = true;
    const delay = 500;
    const id = setTimeout(() => {
      console.log("[InCall] Starting Local STT (token + roomReady)");
      startLocalSTTRef.current?.();
    }, delay);
    return () => clearTimeout(id);
  }, [token, roomReady]);

  // If one side never got "active", retry once after 3s (e.g. roomReady came late or first start failed)
  useEffect(() => {
    if (!token || hasEndedRef.current || hasRetriedLocalSTTRef.current) return;
    const id = setTimeout(() => {
      if (hasEndedRef.current) return;
      if (
        transcriptionStatus === "idle" &&
        !localSttActiveRef.current &&
        !isMutedRef.current
      ) {
        hasRetriedLocalSTTRef.current = true;
        console.log("[InCall] Retry starting Local STT (other side fallback)");
        startLocalSTTRef.current?.();
      }
    }, 3000);
    return () => clearTimeout(id);
  }, [token, transcriptionStatus]);

  useEffect(() => {
    isMutedRef.current = isMuted;
    if (isMuted) {
      setTranscriptionStatus("active");
    } else if (token && !hasEndedRef.current && !localSttActiveRef.current) {
      startLocalSTT();
    }
  }, [isMuted, token, startLocalSTT]);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withTiming(1.4, { duration: 1500 }),
      -1,
      true,
    );
    pulseOpacity.value = withRepeat(
      withTiming(0, { duration: 1500 }),
      -1,
      true,
    );
  }, []);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));
  useEffect(() => {
    if (!isDirect) return;

    const handleStatus = (data: {
      status: "accepted" | "declined";
      conversationId: string;
      sessionId?: string;
    }) => {
      if (
        data.conversationId === conversationId ||
        data.conversationId === sessionId
      ) {
        if (data.status === "accepted") {
          if (data.sessionId) setSessionId(data.sessionId);
          setCallStatus("connected");
          setIsWaiting(false);
        } else {
          setCallStatus("declined");
          setTimeout(() => navigation.goBack(), 2000);
        }
      }
    };

    const socketService = SocketService.getInstance();
    socketService.onCallStatusUpdate(handleStatus);

    return () => {
      socketService.offCallStatusUpdate(handleStatus);
    };
  }, [sessionId, isDirect]);

  useEffect(() => {
    const fetchToken = async () => {
      if (!user || !sessionId) return;
      if (isWaiting) return;

      try {
        // Matchmaking provides a roomName. Direct calls use direct_ prefix.
        const roomSessionId =
          route.params?.roomName ||
          (route.params?.isDirect ? `direct_${sessionId}` : sessionId);

        console.log(
          `[InCall] Connecting to LiveKit room: ${roomSessionId} (sessionId: ${sessionId})`,
        );

        const res = await livekitApi.getToken(user.id, roomSessionId);
        setToken(res.token);
      } catch (error) {
        console.error("Failed to get LiveKit token:", error);
      }
    };
    fetchToken();
  }, [user, sessionId, isWaiting]);

  // The obsolete /audio WebSocket connection has been removed.
  // Real-time transcription is now handled by LiveKit natively via DataListener (RoomEvent.TranscriptionReceived).

  const formatTime = (isoString?: string) => {
    const date = isoString ? new Date(isoString) : new Date();
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);

    // Point 4: Peer join timeout (30s)
    if (isWaiting) {
      joinTimeoutRef.current = setTimeout(() => {
        if (isWaiting && callStatus === "calling") {
          Alert.alert("No Answer", `${partnerName} didn't join the call.`, [
            { text: "OK", onPress: () => navigation.goBack() },
          ]);
          handleEndCall(false);
        }
      }, 30000);
    }

    return () => {
      clearInterval(interval);
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
    };
  }, [isWaiting, callStatus]);

  // Auto-scroll transcript
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [transcript.length]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleEndCall = useCallback(
    async (remoteTriggered = false) => {
      if (hasEndedRef.current) return;
      hasEndedRef.current = true;

      // 1. Brief delay so any in-flight speech result commits to state and ref
      await new Promise((r) => setTimeout(r, 80));

      // 2. Flush any pending interim transcript so it's included in the payload
      const current = transcriptRef.current;
      const pending = current.find((t) => t.id === "pending-local");
      const lines = pending?.text?.trim()
        ? [
            ...current.filter((t) => t.id !== "pending-local"),
            {
              ...pending,
              id: `local-${Date.now()}`,
              speaker: "user" as const,
              text: pending.text.trim(),
            },
          ]
        : current;

      // 3. Stop STT cleanly (clear keepalive timer, then abort)
      if (sttRestartTimerRef.current) {
        clearTimeout(sttRestartTimerRef.current);
        sttRestartTimerRef.current = null;
      }
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch (_) {}

      console.log(
        `[InCall] Ending session: ${sessionId} (remote: ${remoteTriggered})`,
      );

      try {
        if (sessionId && sessionId !== "session-id" && user?.id) {
          // Only send this device's speech (speaker === "user" — must match transcriptRef labels).
          const mySegments = lines
            .filter(
              (t) =>
                t.speaker === "user" &&
                typeof t.text === "string" &&
                t.text.trim().length > 0,
            )
            .map((t) => ({
              speaker_id: user.id,
              text: t.text.trim(),
              timestamp: (t as any).time ?? new Date().toISOString(),
            }));
          if (mySegments.length === 0) {
            console.warn(
              "[InCall] No local segments found — check speaker label filter (expect \"user\"). Still calling endSession so participant feedback row exists.",
            );
          } else {
            console.log(
              `[InCall] Submitting my segments only: ${mySegments.length} lines`,
            );
          }
          await sessionsApi.endSession(sessionId, {
            transcript: mySegments,
            actualDuration: durationRef.current,
            userEndedEarly: true,
          });
        }

        // 3. Then tell the partner and disconnect (so they get a clean end)
        if (
          !remoteTriggered &&
          roomRef.current &&
          roomRef.current.state === "connected"
        ) {
          try {
            await roomRef.current.localParticipant.publishData(
              Buffer.from(JSON.stringify({ type: "end_session" })),
              { reliable: true },
            );
            console.log("[InCall] Broadcasted end_session signal");
          } catch (err) {
            console.warn("[InCall] Failed to send end_session signal:", err);
          }
          try {
            roomRef.current.disconnect();
          } catch (e) {
            console.warn("[InCall] Disconnect error:", e);
          }
        }
      } catch (error) {
        console.error("[InCall] Failed to end session:", error);
      }

      navigation.replace("CallFeedback", {
        sessionId: sessionId || "session-id",
        partnerName,
        topic,
        duration: durationRef.current,
      });
    },
    [sessionId, navigation, partnerName, topic, user?.id],
  );

  const handleTranscription = useCallback(
    (data: any) => {
      const text = typeof data.text === "string" ? data.text.trim() : "";
      if (!text) return;
      hasLiveKitSttRef.current = true;
      setTranscriptionStatus("active");

      // 1. If it's from local STT (already added to transcript), don't add again
      // (Wait, local STT adds itself with speaker "user". Remote signals for local user
      // should be ignored by the local user, but added by the remote user as "partner")

      // 2. Identify speaker:
      // - If data.fromRemote is true, it came from the peer's broadcast -> always "partner"
      // - If data.userId matches local user and NOT fromRemote -> "user"
      // - Otherwise (LiveKit native STT) -> compare userId
      const isFromSelf =
        data.fromRemote !== true &&
        data.userId != null &&
        data.userId === user?.id;

      if (isFromSelf && data.fromRemote) return;

      const newItem = {
        id: `trans-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        speaker: isFromSelf ? "user" : "partner",
        text,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      transcriptRef.current = [...transcriptRef.current, newItem];
      setTranscript(transcriptRef.current);
    },
    [user?.id],
  );

  const handleRemoteEndSession = useCallback(() => {
    console.log("[InCall] Remote ended call");
    // Disconnect so we leave the room immediately
    try {
      roomRef.current?.disconnect();
    } catch (e) {
      console.warn("[InCall] Disconnect on remote end:", e);
    }
    handleEndCall(true);
  }, [handleEndCall]);

  if (!token) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <StatusBar barStyle="dark-content" />
        <View
          style={[
            styles.background,
            { backgroundColor: theme.colors.background },
          ]}
        />
        <Animated.View entering={FadeIn} style={{ alignItems: "center" }}>
          <Ionicons
            name="call"
            size={48}
            color={theme.colors.primary}
            style={{ marginBottom: 20 }}
          />
          <Text
            style={{
              color: theme.colors.text.primary,
              fontSize: 18,
              fontWeight: "600",
            }}
          >
            Connecting...
          </Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LiveKitRoom
        serverUrl={LIVEKIT_URL}
        token={token}
        connect={!!token}
        audio={true}
        video={false}
        onDisconnected={() => handleEndCall(true)}
      >
        <StatusBar barStyle="dark-content" />
        <RoomHandler
          onRoomReady={(room) => {
            roomRef.current = room;
            setRoomReady(true);
            // Force the microphone into the desired state on join
            try {
              room.localParticipant.setMicrophoneEnabled(!isMuted);
            } catch (e) {
              console.warn("[InCall] Initial mic enable failed:", e);
            }
          }}
          onReconnected={(room) => {
            // Re-sync microphone state on reconnection
            try {
              room.localParticipant.setMicrophoneEnabled(!isMuted);
            } catch (e) {
              console.warn("[InCall] Re-sync mic enable failed:", e);
            }
            if (!hasEndedRef.current && !hasLiveKitSttRef.current && token) {
              startLocalSTT();
            }
          }}
        />
        <DataListener
          onTranscription={handleTranscription}
          onEndSession={handleRemoteEndSession}
          setRoomRef={(r) => {
            roomRef.current = r;
          }}
        />
        <View
          style={[
            styles.background,
            { backgroundColor: theme.colors.background },
          ]}
        />

        <SafeAreaView style={styles.safeArea}>
          {/* AudioConference handles actual audio */}
          <AudioConference />

          {/* Header: Topic and Timer */}
          <Animated.View entering={FadeIn.delay(200)} style={styles.header}>
            <View style={styles.headerGlass}>
              <View style={styles.topicPill}>
                <Ionicons
                  name="chatbubbles"
                  size={14}
                  color={theme.colors.primary}
                />
                <Text style={styles.topicText}>{topic}</Text>
              </View>
              <View style={styles.timerContainer}>
                <View style={styles.liveDot} />
                <Text style={styles.timerText}>{formatDuration(duration)}</Text>
              </View>
            </View>
          </Animated.View>

          {/* Partner Section */}
          <Animated.View
            entering={FadeInUp.delay(300).springify()}
            style={styles.partnerSection}
          >
            <View style={styles.avatarGlowContainer}>
              <Animated.View style={[styles.avatarPulse, animatedPulseStyle]} />
              <LinearGradient
                colors={theme.colors.gradients.premium}
                style={styles.partnerAvatar}
              >
                <Text style={styles.partnerInitial}>
                  {partnerName.charAt(0)}
                </Text>
              </LinearGradient>
            </View>
            <Text style={styles.partnerName}>{partnerName}</Text>
            <Text style={styles.statusText}>
              {isWaiting
                ? callStatus === "declined"
                  ? "Call Declined"
                  : "Calling..."
                : "Live Connection"}
            </Text>
          </Animated.View>

          {isWaiting && callStatus !== "declined" && (
            <View style={styles.waitingOverlay}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.waitingText}>
                Waiting for {partnerName} to join...
              </Text>
            </View>
          )}

          {/* Transcript: Live conversation */}
          <View style={styles.transcriptContainer}>
            <View style={styles.transcriptHeader}>
              <View style={styles.transcriptIndicator} />
              <View style={{ flex: 1 }}>
                <Text style={styles.transcriptLabel}>Live transcript</Text>
                <TranscriptionStatus status={transcriptionStatus} />
              </View>
            </View>
            <ScrollView
              ref={scrollRef}
              style={styles.transcriptScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.transcriptContent}
            >
              {transcript.map((item, index) => (
                <TranscriptBubble
                  key={item.id || index}
                  item={item}
                  index={index}
                  partnerName={partnerName}
                  isPartnerBot={partnerName.toLowerCase().includes("bot")}
                />
              ))}
            </ScrollView>
          </View>

          {/* Controls: Floating Dock */}
          <View
            style={[
              styles.controlsWrapper,
              { bottom: Math.max(insets.bottom, 20) },
            ]}
          >
            <Animated.View
              entering={FadeInUp.delay(600).springify()}
              style={styles.controlsDock}
            >
              <ControlButton
                icon={isMuted ? "mic-off" : "mic"}
                label={isMuted ? "Muted" : "Mic"}
                active={!isMuted}
                secondary
                onPress={() => {
                  const next = !isMuted;
                  try {
                    roomRef.current?.localParticipant?.setMicrophoneEnabled(
                      !next,
                    );
                  } catch (e) {
                    console.warn("[InCall] setMicrophoneEnabled failed:", e);
                  }
                  isMutedRef.current = next;
                  setIsMuted(next);
                }}
              />
              <ControlButton
                icon={isSpeaker ? "volume-high" : "volume-medium"}
                label="Audio"
                active={isSpeaker}
                secondary
                onPress={() => setIsSpeaker(!isSpeaker)}
              />
              <View style={styles.controlDivider} />
              <ControlButton
                icon="close"
                label="End call"
                danger
                onPress={() => handleEndCall(false)}
              />
            </Animated.View>
          </View>
        </SafeAreaView>
      </LiveKitRoom>
    </View>
  );
}

const getStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    background: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    safeArea: {
      flex: 1,
    },
    header: {
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: theme.spacing.m,
    },
    headerGlass: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border + "20",
      ...theme.shadows.small,
    },
    topicPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    topicText: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: "600",
    },
    waitingOverlay: {
      marginTop: 40,
      alignItems: "center",
      gap: 12,
    },
    waitingText: {
      color: theme.colors.text.secondary,
      fontSize: 16,
      fontWeight: "500",
    },
    partnerSection: {
      alignItems: "center",
      paddingVertical: 20,
    },
    avatarGlowContainer: {
      position: "relative",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    avatarPulse: {
      position: "absolute",
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: theme.colors.primary,
      opacity: 0.15,
    },
    partnerAvatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: "white",
      ...theme.shadows.medium,
    },
    partnerInitial: {
      color: "white",
      fontSize: 32,
      fontWeight: "bold",
    },
    partnerName: {
      color: theme.colors.text.primary,
      fontSize: 22,
      fontWeight: "bold",
      letterSpacing: 0.5,
    },
    statusText: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      fontWeight: "600",
      marginTop: 4,
    },
    timerContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.primary + "15",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 6,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.success,
    },
    timerText: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    transcriptContainer: {
      flex: 1,
      minHeight: 160,
      marginHorizontal: 16,
      marginBottom: 100,
      borderRadius: 24,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border + "20",
      overflow: "hidden",
      ...theme.shadows.small,
    },
    transcriptHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border + "15",
      gap: 10,
    },
    transcriptIndicator: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.colors.primary,
    },
    transcriptLabel: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: "700",
      flex: 1,
    },
    transcriptScroll: {
      flex: 1,
    },
    transcriptContent: {
      padding: 16,
      paddingBottom: 24,
      gap: 12,
    },
    bubbleRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
    },
    bubbleRowLeft: {
      justifyContent: "flex-start",
    },
    bubbleRowRight: {
      justifyContent: "flex-end",
    },
    miniAvatar: {
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 4,
    },
    miniAvatarText: {
      fontSize: 10,
      fontWeight: "bold",
      color: "white",
    },
    bubble: {
      maxWidth: SCREEN_WIDTH * 0.65,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
    },
    bubbleUser: {
      backgroundColor: theme.colors.primary,
      borderBottomRightRadius: 4,
      ...theme.shadows.primaryGlow,
    },
    bubblePartner: {
      backgroundColor: "white",
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: theme.colors.border + "20",
    },
    bubbleLabel: {
      fontSize: 11,
      fontWeight: "700",
      marginBottom: 4,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    bubbleLabelUser: {
      color: "rgba(255,255,255,0.9)",
    },
    bubbleLabelPartner: {
      color: theme.colors.text.secondary,
    },
    bubbleText: {
      fontSize: 15,
      lineHeight: 22,
    },
    bubbleTextUser: {
      color: "white",
      fontWeight: "500",
    },
    bubbleTextPartner: {
      color: theme.colors.text.primary,
    },
    bubbleTime: {
      fontSize: 9,
      color: theme.colors.text.light,
      textAlign: "right",
      marginTop: 4,
    },
    controlsWrapper: {
      position: "absolute",
      bottom: 30,
      left: 0,
      right: 0,
      alignItems: "center",
      paddingHorizontal: 20,
    },
    controlsDock: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "white",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 32,
      borderWidth: 1,
      borderColor: theme.colors.border + "20",
      gap: 12,
      ...theme.shadows.large,
    },
    controlDivider: {
      width: 1,
      height: 30,
      backgroundColor: theme.colors.border + "20",
      marginHorizontal: 5,
    },
    controlButton: {
      alignItems: "center",
      justifyContent: "center",
      minWidth: 52,
    },
    controlIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 4,
    },
    controlIconSecondary: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border + "15",
    },
    controlIconDanger: {
      backgroundColor: theme.colors.error,
      ...theme.shadows.small,
    },
    controlIconActive: {
      backgroundColor: theme.colors.primary,
    },
    controlLabel: {
      color: theme.colors.text.secondary,
      fontSize: 10,
      fontWeight: "600",
    },
    transcriptionStatus: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 2,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: 6,
    },
    statusDotIdle: {
      backgroundColor: "#94a3b8",
    },
    statusDotActive: {
      backgroundColor: "#10b981",
    },
    statusDotError: {
      backgroundColor: "#ef4444",
    },
    statusTextMini: {
      fontSize: 10,
      color: "#64748b",
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
  });
