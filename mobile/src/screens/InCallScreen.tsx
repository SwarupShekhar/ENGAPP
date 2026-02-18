import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Dimensions, StatusBar, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    FadeIn,
    FadeInUp,
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming
} from 'react-native-reanimated';
import { useUser } from '@clerk/clerk-expo';
import {
    LiveKitRoom,
    useTracks,
    useRoomContext,
    TrackReferenceOrPlaceholder,
} from '@livekit/react-native';
import { Track, RoomEvent } from 'livekit-client';
import { io, Socket } from 'socket.io-client';
import SocketService from '../services/socketService';
import { theme } from '../theme/theme';
import { livekitApi } from '../api/livekit';
import { sessionsApi } from '../api/sessions';
import { API_URL } from '../api/client';
import { Buffer } from 'buffer';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// In a real app, these would come from environment variables
const LIVEKIT_URL = 'wss://engrapp-8lz8v8ia.livekit.cloud';

// ─── Data Listener Component ───────────────────────────────
function DataListener({ onTranscription, onEndSession }: { 
    onTranscription: (data: any) => void;
    onEndSession: () => void;
}) {
    const room = useRoomContext();

    useEffect(() => {
        const handleData = (payload: Uint8Array) => {
            try {
                const str = Buffer.from(payload).toString('utf-8');
                const data = JSON.parse(str);
                if (data.type === 'transcription') {
                    onTranscription(data);
                } else if (data.type === 'end_session') {
                    console.log('[LiveKit] Received end_session signal');
                    onEndSession();
                }
            } catch (e) {
                console.error('Failed to parse data packet:', e);
            }
        };

        room.on(RoomEvent.DataReceived, handleData);
        return () => {
            room.off(RoomEvent.DataReceived, handleData);
        };
    }, [room, onTranscription, onEndSession]);

    return null;
}

// ─── Room Handler Component ────────────────────────────────
function RoomHandler({ onRoomReady }: { onRoomReady: (room: any) => void }) {
    const room = useRoomContext();
    useEffect(() => {
        onRoomReady(room);
    }, [room, onRoomReady]);
    return null;
}

// ─── Audio Conference Component ────────────────────────────
function AudioConference() {
    const tracks = useTracks([Track.Source.Microphone]);
    return (
        <View style={{ display: 'none' }}>
            {tracks.map((track) => (
                <View key={track.publication.trackSid} />
            ))}
        </View>
    );
}

// ─── Mock Transcript Data ──────────────────────────────────
const MOCK_TRANSCRIPT = [
    { id: '1', speaker: 'partner', text: "Hi! I'm your co-learner. Ready to practice?", time: '0:01' },
];

// ─── Transcript Bubble ────────────────────────────────────
function TranscriptBubble({ item, index, isPartnerBot }: { item: any; index: number; isPartnerBot?: boolean }) {
    const isUser = item.speaker === 'user';
    return (
        <Animated.View
            entering={FadeInUp.delay(index * 100).springify()}
            style={[
                styles.bubbleRow,
                isUser ? styles.bubbleRowRight : styles.bubbleRowLeft,
            ]}
        >
            {!isUser && (
                <View style={[styles.miniAvatar, { backgroundColor: isPartnerBot ? theme.colors.primary : theme.colors.secondary }]}>
                    <Text style={styles.miniAvatarText}>{isPartnerBot ? 'B' : 'P'}</Text>
                </View>
            )}
            <View style={[
                styles.bubble,
                isUser ? styles.bubbleUser : styles.bubblePartner
            ]}>
                <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextPartner]}>
                    {item.text}
                </Text>
                <Text style={styles.bubbleTime}>{item.time}</Text>
            </View>
            {isUser && (
                <View style={[styles.miniAvatar, { backgroundColor: theme.colors.primaryLight }]}>
                    <Text style={[styles.miniAvatarText, { color: theme.colors.primary }]}>U</Text>
                </View>
            )}
        </Animated.View>
    );
}

// ─── Control Button ───────────────────────────────────────
function ControlButton({ icon, label, onPress, danger, active, secondary }: {
    icon: string; label: string; onPress: () => void; danger?: boolean; active?: boolean; secondary?: boolean;
}) {
    return (
        <TouchableOpacity style={styles.controlButton} onPress={onPress} activeOpacity={0.7}>
            <View style={[
                styles.controlIcon,
                danger && styles.controlIconDanger,
                active && styles.controlIconActive,
                secondary && styles.controlIconSecondary,
            ]}>
                <Ionicons name={icon as any} size={22} color="white" />
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
    const [transcript, setTranscript] = useState<any[]>(MOCK_TRANSCRIPT);
    const scrollRef = useRef<ScrollView>(null);
    const roomRef = useRef<any>(null);
    const hasEndedRef = useRef(false);

    const socketRef = useRef<Socket | null>(null);

    const [sessionId, setSessionId] = useState(route?.params?.sessionId);
    const partnerName = route?.params?.partnerName || 'Co-learner';
    const topic = route?.params?.topic || 'General Practice';
    const isDirect = route?.params?.isDirect;
    const isCaller = route?.params?.isCaller ?? false;
    const conversationId = route?.params?.conversationId || sessionId;

    // Only the caller waits. The receiver has already accepted.
    const [isWaiting, setIsWaiting] = useState(isDirect && isCaller);
    const [callStatus, setCallStatus] = useState<'calling' | 'connected' | 'declined'>('calling');

    const pulseScale = useSharedValue(1);
    const pulseOpacity = useSharedValue(0.15);

    useEffect(() => {
        pulseScale.value = withRepeat(
            withTiming(1.4, { duration: 1500 }),
            -1,
            true
        );
        pulseOpacity.value = withRepeat(
            withTiming(0, { duration: 1500 }),
            -1,
            true
        );
    }, []);

    const animatedPulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
        opacity: pulseOpacity.value,
    }));
    useEffect(() => {
        if (!isDirect) return;

        const handleStatus = (data: { status: 'accepted' | 'declined', conversationId: string, sessionId?: string }) => {
            if (data.conversationId === conversationId || data.conversationId === sessionId) {
                if (data.status === 'accepted') {
                    if (data.sessionId) setSessionId(data.sessionId);
                    setCallStatus('connected');
                    setIsWaiting(false);
                } else {
                    setCallStatus('declined');
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
            // Don't connect if we are waiting for the partner to accept
            if (isWaiting) return;

            try {
                // For direct calls, we prefix the room name to avoid matchmaking collisions
                const roomSessionId = route.params?.isDirect ? `direct_${sessionId}` : sessionId;
                const res = await livekitApi.getToken(user.id, roomSessionId);
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

    const handleEndCall = async (remoteTriggered = false) => {
        if (hasEndedRef.current) return;
        hasEndedRef.current = true;

        console.log(`[InCall] Ending session: ${sessionId} (remote: ${remoteTriggered})`);
        
        try {
            // If we are the ones ending it, tell the partner
            if (!remoteTriggered && roomRef.current) {
                const signal = JSON.stringify({ type: 'end_session' });
                const data = Buffer.from(signal);
                await roomRef.current.localParticipant.publishData(data, { reliable: true });
                console.log('[InCall] Broadcasted end_session signal');
            }

            if (sessionId && sessionId !== 'session-id') {
                // Collect all user transcript text to help backend short-circuit if empty
                const fullTranscriptText = transcript
                    .filter(t => t.speaker === 'user')
                    .map(t => t.text)
                    .join(' ');

                // We only call the end API if we are the initiator, or if we want to be safe
                // In a P2P scenario, both calling is fine for idempotency
                await sessionsApi.endSession(sessionId, {
                    transcript: fullTranscriptText,
                    actualDuration: duration,
                    userEndedEarly: true
                });
            } else {
                console.warn('[InCall] No valid sessionId to end');
            }
        } catch (error) {
            console.error('[InCall] Failed to end session:', error);
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
                connect={!isWaiting}
                audio={true}
                video={false}
                onDisconnected={() => handleEndCall(true)}
            >
                <StatusBar barStyle="light-content" />
                <RoomHandler onRoomReady={(room) => { roomRef.current = room; }} />
                <DataListener 
                    onTranscription={(data) => {
                        setTranscript(prev => [
                            ...prev,
                            {
                                id: Date.now().toString(),
                                speaker: data.userId === user?.id ? 'user' : 'partner',
                                text: data.text,
                                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            }
                        ]);
                    }} 
                    onEndSession={() => handleEndCall(true)}
                />
                <LinearGradient
                    colors={['#0F172A', '#1E293B', '#111827']}
                    style={styles.background}
                />

                <SafeAreaView style={styles.safeArea}>
                    {/* AudioConference handles actual audio */}
                    <AudioConference />

                    {/* Header: Topic and Timer */}
                    <Animated.View entering={FadeIn.delay(200)} style={styles.header}>
                        <View style={styles.headerGlass}>
                            <View style={styles.topicPill}>
                                <Ionicons name="chatbubbles" size={14} color={theme.colors.primaryLight} />
                                <Text style={styles.topicText}>{topic}</Text>
                            </View>
                            <View style={styles.timerContainer}>
                                <View style={styles.liveDot} />
                                <Text style={styles.timerText}>{formatDuration(duration)}</Text>
                            </View>
                        </View>
                    </Animated.View>

                    {/* Partner Section */}
                    <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.partnerSection}>
                        <View style={styles.avatarGlowContainer}>
                            <Animated.View style={[styles.avatarPulse, animatedPulseStyle]} />
                            <LinearGradient
                                colors={theme.colors.gradients.premium}
                                style={styles.partnerAvatar}
                            >
                                <Text style={styles.partnerInitial}>{partnerName.charAt(0)}</Text>
                            </LinearGradient>
                        </View>
                        <Text style={styles.partnerName}>{partnerName}</Text>
                        <Text style={styles.statusText}>
                            {isWaiting ? (callStatus === 'declined' ? 'Call Declined' : 'Calling...') : 'Live Connection'}
                        </Text>
                    </Animated.View>

                    {isWaiting && callStatus !== 'declined' && (
                        <View style={styles.waitingOverlay}>
                            <ActivityIndicator size="large" color={theme.colors.primaryLight} />
                            <Text style={styles.waitingText}>Waiting for {partnerName} to join...</Text>
                        </View>
                    )}

                    {/* Transcript: Glassmorphism container */}
                    <View style={styles.transcriptContainer}>
                        <View style={styles.transcriptHeader}>
                            <View style={styles.transcriptIndicator} />
                            <Text style={styles.transcriptLabel}>Live Analysis</Text>
                            <View style={styles.activeLabel}>
                                <Text style={styles.activeLabelText}>AI ASSISTANT</Text>
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
                                    key={item.id}
                                    item={item}
                                    index={index}
                                    isPartnerBot={partnerName.toLowerCase().includes('bot')}
                                />
                            ))}
                        </ScrollView>
                    </View>

                    {/* Controls: Floating Dock */}
                    <View style={styles.controlsWrapper}>
                        <Animated.View entering={FadeInUp.delay(600).springify()} style={styles.controlsDock}>
                            <ControlButton
                                icon={isMuted ? 'mic-off' : 'mic'}
                                label={isMuted ? 'Muted' : 'Mic'}
                                active={!isMuted}
                                secondary
                                onPress={() => setIsMuted(!isMuted)}
                            />
                            <ControlButton
                                icon={isSpeaker ? 'volume-high' : 'volume-medium'}
                                label="Audio"
                                active={isSpeaker}
                                secondary
                                onPress={() => setIsSpeaker(!isSpeaker)}
                            />
                            <ControlButton
                                icon="create-outline"
                                label="Notes"
                                secondary
                                onPress={() => { }}
                            />
                            <View style={styles.controlDivider} />
                            <ControlButton
                                icon="close"
                                label="End"
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
        paddingVertical: 12,
        paddingHorizontal: theme.spacing.m,
    },
    headerGlass: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    topicPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    topicText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    waitingOverlay: {
        marginTop: 40,
        alignItems: 'center',
        gap: 12,
    },
    waitingText: {
        color: '#94A3B8',
        fontSize: 16,
        fontWeight: '500',
    },
    partnerSection: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    avatarGlowContainer: {
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    avatarPulse: {
        position: 'absolute',
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
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    partnerInitial: {
        color: 'white',
        fontSize: 32,
        fontWeight: 'bold',
    },
    partnerName: {
        color: 'white',
        fontSize: 22,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    statusText: {
        color: theme.colors.primaryLight,
        fontSize: 12,
        fontWeight: '600',
        marginTop: 4,
        opacity: 0.8,
    },
    timerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
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
        color: 'white',
        fontSize: 12,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    transcriptContainer: {
        flex: 1,
        marginHorizontal: 16,
        marginBottom: 100, // Room for dock
        borderRadius: 24,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
    },
    transcriptHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.05)',
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
        color: 'white',
        fontSize: 14,
        fontWeight: '700',
        flex: 1,
    },
    activeLabel: {
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    activeLabelText: {
        color: theme.colors.primaryLight,
        fontSize: 10,
        fontWeight: '800',
    },
    transcriptScroll: {
        flex: 1,
    },
    transcriptContent: {
        padding: 16,
        gap: 12,
    },
    bubbleRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
    },
    bubbleRowLeft: {
        justifyContent: 'flex-start',
    },
    bubbleRowRight: {
        justifyContent: 'flex-end',
    },
    miniAvatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 4,
    },
    miniAvatarText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: 'white',
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
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    bubbleText: {
        fontSize: 15,
        lineHeight: 20,
    },
    bubbleTextUser: {
        color: 'white',
        fontWeight: '500',
    },
    bubbleTextPartner: {
        color: '#E2E8F0',
    },
    bubbleTime: {
        fontSize: 9,
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'right',
        marginTop: 4,
    },
    controlsWrapper: {
        position: 'absolute',
        bottom: 30,
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    controlsDock: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(30, 41, 59, 0.95)',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 35,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        gap: 15,
        ...theme.shadows.large,
    },
    controlDivider: {
        width: 1,
        height: 30,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginHorizontal: 5,
    },
    controlButton: {
        alignItems: 'center',
        minWidth: 50,
    },
    controlIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 4,
    },
    controlIconSecondary: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    controlIconDanger: {
        backgroundColor: theme.colors.error,
    },
    controlIconActive: {
        backgroundColor: theme.colors.primary,
    },
    controlLabel: {
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: 10,
        fontWeight: '600',
    },
});
