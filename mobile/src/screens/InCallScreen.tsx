import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Dimensions, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp, SlideInRight } from 'react-native-reanimated';
import { useUser } from '@clerk/clerk-expo';
import {
    LiveKitRoom,
    useTracks,
    useRoomContext,
    TrackReferenceOrPlaceholder,
    isTrackReference,
} from '@livekit/react-native';
import { Track, RoomEvent, DataPacket_Kind } from 'livekit-client';
import { io, Socket } from 'socket.io-client';
import { theme } from '../theme/theme';
import { livekitApi } from '../api/livekit';
import { sessionsApi } from '../api/sessions';
import { API_URL } from '../api/client';
import { Buffer } from 'buffer';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// In a real app, these would come from environment variables
const LIVEKIT_URL = 'wss://engrapp-8lz8v8ia.livekit.cloud';
const SOCKET_URL = 'http://172.20.10.13:3000/audio'; // Same as API_URL but with namespace

// ─── Data Listener Component ───────────────────────────────
function DataListener({ onTranscription }: { onTranscription: (data: any) => void }) {
    const room = useRoomContext();

    useEffect(() => {
        const handleData = (payload: Uint8Array, participant?: any) => {
            try {
                const str = Buffer.from(payload).toString('utf-8');
                const data = JSON.parse(str);
                if (data.type === 'transcription') {
                    onTranscription(data);
                }
            } catch (e) {
                console.error('Failed to parse data packet:', e);
            }
        };

        room.on(RoomEvent.DataReceived, handleData);
        return () => {
            room.off(RoomEvent.DataReceived, handleData);
        };
    }, [room, onTranscription]);

    return null;
}

// ─── Audio Conference Component ────────────────────────────
function AudioConference() {
    const tracks = useTracks([Track.Source.Microphone]);
    return (
        <View style={{ display: 'none' }}>
            {tracks.map((track) => (
                <AudioTrack key={track.publication.trackSid} trackRef={track} />
            ))}
        </View>
    );
}

function AudioTrack({ trackRef }: { trackRef: TrackReferenceOrPlaceholder }) {
    // This is a placeholder as @livekit/react-native handles audio playback automatically
    // when connected to a room. We just need to ensure tracks are subscribed.
    return null;
}

// ─── Mock Transcript Data ──────────────────────────────────
const MOCK_TRANSCRIPT = [
    { id: '1', speaker: 'partner', text: "Hi! I'm your co-learner. Ready to practice?", time: '0:01' },
];

// ─── Transcript Bubble ────────────────────────────────────
function TranscriptBubble({ item, index }: { item: any; index: number }) {
    const isUser = item.speaker === 'user';
    return (
        <Animated.View
            entering={SlideInRight.delay(index * 300).springify()}
            style={[
                styles.bubbleRow,
                isUser ? styles.bubbleRowRight : styles.bubbleRowLeft,
            ]}
        >
            <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubblePartner]}>
                <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextPartner]}>
                    {item.text}
                </Text>
                <Text style={styles.bubbleTime}>{item.time}</Text>
            </View>
        </Animated.View>
    );
}

// ─── Control Button ───────────────────────────────────────
function ControlButton({ icon, label, onPress, danger, active }: {
    icon: string; label: string; onPress: () => void; danger?: boolean; active?: boolean;
}) {
    return (
        <TouchableOpacity style={styles.controlButton} onPress={onPress} activeOpacity={0.7}>
            <View style={[
                styles.controlIcon,
                danger && styles.controlIconDanger,
                active && styles.controlIconActive,
            ]}>
                <Ionicons name={icon as any} size={24} color="white" />
            </View>
            <Text style={styles.controlLabel}>{label}</Text>
        </TouchableOpacity>
    );
}

// ─── Main Component ───────────────────────────────────────
export default function InCallScreen({ navigation, route }: any) {
    const { user } = useUser();
    const [token, setToken] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeaker, setIsSpeaker] = useState(false);
    const [visibleMessages, setVisibleMessages] = useState(0);
    const [transcript, setTranscript] = useState<any[]>(MOCK_TRANSCRIPT);
    const scrollRef = useRef<ScrollView>(null);

    const socketRef = useRef<Socket | null>(null);

    const sessionId = route?.params?.sessionId;
    const partnerName = route?.params?.partnerName || 'Co-learner';
    const topic = route?.params?.topic || 'General Practice';

    // Fetch Token on Mount
    useEffect(() => {
        const fetchToken = async () => {
            if (!user || !sessionId) return;
            try {
                const res = await livekitApi.getToken(user.id, sessionId);
                setToken(res.token);
            } catch (error) {
                console.error('Failed to get LiveKit token:', error);
            }
        };
        fetchToken();
    }, [user, sessionId]);

    // Socket.io for transcription
    useEffect(() => {
        if (!user || !sessionId || !token) return;

        // Connect to the audio namespace
        const socketUrl = `${API_URL}/audio`;

        socketRef.current = io(socketUrl, {
            auth: { token },
            transports: ['websocket'],
        });

        const socket = socketRef.current;

        socket.on('connect', () => {
            console.log('[Socket] Connected to audio namespace');
            socket.emit('startStream', {
                userId: user.id,
                sessionId,
                language: 'en-US'
            });
        });

        socket.on('transcription', (data: { text: string; isFinal: boolean; timestamp: string }) => {
            console.log('[Socket] Transcription received:', data.text);
            if (data.isFinal) {
                setTranscript(prev => [
                    ...prev,
                    {
                        id: Date.now().toString(),
                        speaker: 'user',
                        text: data.text,
                        time: formatTime(data.timestamp)
                    }
                ]);
            }
        });

        socket.on('error', (err) => {
            console.error('[Socket] Error:', err);
        });

        // NOTE: To send REAL audio data, we need a native bridge like react-native-live-audio-stream
        // or to use a server-side LiveKit egress. Since LiveKit is already using the Mic,
        // we can't easily record simultaneously with standard Expo APIs.
        // socket.emit('audioData', pcmBuffer);

        return () => {
            if (socket.connected) {
                socket.emit('stopStream');
                socket.disconnect();
            }
        };
    }, [user, sessionId, token]);

    const formatTime = (isoString?: string) => {
        const date = isoString ? new Date(isoString) : new Date();
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Timer
    useEffect(() => {
        const interval = setInterval(() => {
            setDuration(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Auto-scroll transcript
    useEffect(() => {
        setTimeout(() => {
            scrollRef.current?.scrollToEnd({ animated: true });
        }, 100);
    }, [transcript.length]);

    const formatDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const handleEndCall = async () => {
        try {
            if (sessionId) {
                await sessionsApi.endSession(sessionId);
            }
        } catch (error) {
            console.error('Failed to end session:', error);
        }
        navigation.replace('CallFeedback', {
            sessionId: sessionId || 'session-id',
            partnerName,
            topic,
            duration,
        });
    };

    if (!token) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <StatusBar barStyle="light-content" />
                <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.background} />
                <Animated.View entering={FadeIn}>
                    <Ionicons name="call" size={48} color={theme.colors.primaryLight} style={{ marginBottom: 20 }} />
                    <Text style={{ color: 'white', fontSize: 18, fontWeight: '600' }}>Connecting...</Text>
                </Animated.View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <LiveKitRoom
                serverUrl={LIVEKIT_URL}
                token={token}
                connect={true}
                audio={true}
                video={false}
                onDisconnected={() => handleEndCall()}
            >
                <StatusBar barStyle="light-content" />
                <DataListener onTranscription={(data) => {
                    setTranscript(prev => [
                        ...prev,
                        {
                            id: Date.now().toString(),
                            speaker: data.userId === user?.id ? 'user' : 'partner',
                            text: data.text,
                            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        }
                    ]);
                }} />
                <LinearGradient
                    colors={['#1a1a2e', '#16213e', '#0f3460']}
                    style={styles.background}
                />

                <SafeAreaView style={styles.safeArea}>
                    {/* AudioConference handles the actual audio streaming/playback */}
                    <AudioConference />

                    {/* Header */}
                    <Animated.View entering={FadeIn.delay(200)} style={styles.header}>
                        <View style={styles.topicPill}>
                            <Ionicons name="chatbubbles" size={12} color={theme.colors.primaryLight} />
                            <Text style={styles.topicText}>{topic}</Text>
                        </View>
                    </Animated.View>

                    {/* Partner Info */}
                    <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.partnerSection}>
                        <LinearGradient
                            colors={theme.colors.gradients.primary}
                            style={styles.partnerAvatar}
                        >
                            <Text style={styles.partnerInitial}>{partnerName.charAt(0)}</Text>
                        </LinearGradient>
                        <Text style={styles.partnerName}>{partnerName}</Text>
                        <View style={styles.timerContainer}>
                            <View style={styles.liveDot} />
                            <Text style={styles.timerText}>{formatDuration(duration)}</Text>
                        </View>
                    </Animated.View>

                    {/* Live Transcript placeholder */}
                    <View style={styles.transcriptContainer}>
                        <View style={styles.transcriptHeader}>
                            <Ionicons name="text" size={16} color={theme.colors.primaryLight} />
                            <Text style={styles.transcriptLabel}>Live Transcript</Text>
                        </View>
                        <ScrollView
                            ref={scrollRef}
                            style={styles.transcriptScroll}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.transcriptContent}
                        >
                            {transcript.map((item, index) => (
                                <TranscriptBubble key={item.id} item={item} index={index} />
                            ))}
                        </ScrollView>
                    </View>

                    {/* Controls */}
                    <Animated.View entering={FadeInUp.delay(600).springify()} style={styles.controls}>
                        <ControlButton
                            icon={isMuted ? 'mic-off' : 'mic'}
                            label={isMuted ? 'Unmute' : 'Mute'}
                            active={isMuted}
                            onPress={() => setIsMuted(!isMuted)}
                        />
                        <ControlButton
                            icon={isSpeaker ? 'volume-high' : 'volume-medium'}
                            label="Speaker"
                            active={isSpeaker}
                            onPress={() => setIsSpeaker(!isSpeaker)}
                        />
                        <ControlButton
                            icon="close"
                            label="End"
                            danger
                            onPress={handleEndCall}
                        />
                        <ControlButton
                            icon="create-outline"
                            label="Notes"
                            onPress={() => { }}
                        />
                    </Animated.View>
                </SafeAreaView>
            </LiveKitRoom>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    background: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    safeArea: {
        flex: 1,
    },
    header: {
        alignItems: 'center',
        paddingVertical: theme.spacing.s,
    },
    topicPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: theme.spacing.m,
        paddingVertical: 6,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    topicText: {
        color: theme.colors.primaryLight,
        fontSize: theme.typography.sizes.xs,
        fontWeight: '600',
    },
    partnerSection: {
        alignItems: 'center',
        paddingVertical: theme.spacing.m,
    },
    partnerAvatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: theme.spacing.s,
    },
    partnerInitial: {
        color: 'white',
        fontSize: theme.typography.sizes.xl,
        fontWeight: 'bold',
    },
    partnerName: {
        color: 'white',
        fontSize: theme.typography.sizes.l,
        fontWeight: '600',
        marginBottom: theme.spacing.xs,
    },
    timerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: theme.colors.success,
    },
    timerText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: theme.typography.sizes.m,
        fontWeight: '500',
        fontVariant: ['tabular-nums'],
    },
    transcriptContainer: {
        flex: 1,
        marginHorizontal: theme.spacing.m,
        marginBottom: theme.spacing.m,
        borderRadius: theme.borderRadius.l,
        backgroundColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
    },
    transcriptHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.s,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    transcriptLabel: {
        color: theme.colors.primaryLight,
        fontSize: theme.typography.sizes.xs,
        fontWeight: '600',
    },
    transcriptScroll: {
        flex: 1,
    },
    transcriptContent: {
        padding: theme.spacing.m,
        gap: theme.spacing.s,
    },
    bubbleRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    bubbleRowLeft: {
        justifyContent: 'flex-start',
    },
    bubbleRowRight: {
        justifyContent: 'flex-end',
    },
    bubble: {
        maxWidth: SCREEN_WIDTH * 0.65,
        paddingHorizontal: theme.spacing.m,
        paddingVertical: 10,
        borderRadius: theme.borderRadius.l,
    },
    bubbleUser: {
        backgroundColor: theme.colors.primary + 'CC',
        borderBottomRightRadius: 4,
    },
    bubblePartner: {
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderBottomLeftRadius: 4,
    },
    bubbleText: {
        fontSize: theme.typography.sizes.s,
        lineHeight: 20,
    },
    bubbleTextUser: {
        color: 'white',
    },
    bubbleTextPartner: {
        color: 'rgba(255,255,255,0.85)',
    },
    bubbleTime: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'right',
        marginTop: 4,
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        paddingVertical: theme.spacing.l,
        paddingBottom: theme.spacing.m,
    },
    controlButton: {
        alignItems: 'center',
        gap: 6,
    },
    controlIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.12)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    controlIconDanger: {
        backgroundColor: theme.colors.error,
    },
    controlIconActive: {
        backgroundColor: theme.colors.primary,
    },
    controlLabel: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: theme.typography.sizes.xs,
        fontWeight: '500',
    },
});
