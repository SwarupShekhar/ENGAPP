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

// ─── Data & Transcription Listener Component ───────────────────────────────
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
                // Custom data signals
                if (data.type === 'end_session') {
                    console.log('[LiveKit] Received end_session signal');
                    onEndSession();
                }
            } catch (e) {
                // Ignore parse errors (might be raw binary data)
            }
        };

        const handleTranscription = (segments: any[]) => {
            if (!segments || segments.length === 0) return;
            
            // segments is an array of TranscriptionSegment
            segments.forEach(segment => {
                if (segment.isFinal) {
                    onTranscription({
                        userId: segment.speakerIdentity,
                        text: segment.text,
                    });
                }
            });
        };

        // Listen for raw data messages (like end_session)
        room.on(RoomEvent.DataReceived, handleData);
        // Listen for native SIP/Deepgram LiveKit STT transcriptions
        room.on(RoomEvent.TranscriptionReceived, handleTranscription);
        
        return () => {
            room.off(RoomEvent.DataReceived, handleData);
            room.off(RoomEvent.TranscriptionReceived, handleTranscription);
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

// ─── Initial Transcript State ────────────────────────────────
const INITIAL_TRANSCRIPT: any[] = [];

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
    const iconColor = secondary && !active && !danger ? theme.colors.text.primary : "white";
    return (
        <TouchableOpacity style={styles.controlButton} onPress={onPress} activeOpacity={0.7}>
            <View style={[
                styles.controlIcon,
                danger && styles.controlIconDanger,
                active && styles.controlIconActive,
                secondary && !active && styles.controlIconSecondary,
            ]}>
                <Ionicons name={icon as any} size={22} color={iconColor} />
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
    const [transcript, setTranscript] = useState<any[]>(INITIAL_TRANSCRIPT);
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

    // The obsolete /audio WebSocket connection has been removed.
    // Real-time transcription is now handled by LiveKit natively via DataListener (RoomEvent.TranscriptionReceived).

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
                <StatusBar barStyle="dark-content" />
                <View style={[styles.background, { backgroundColor: theme.colors.background }]} />
                <Animated.View entering={FadeIn} style={{ alignItems: 'center' }}>
                    <Ionicons name="call" size={48} color={theme.colors.primary} style={{ marginBottom: 20 }} />
                    <Text style={{ color: theme.colors.text.primary, fontSize: 18, fontWeight: '600' }}>Connecting...</Text>
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
                <StatusBar barStyle="dark-content" />
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
                <View style={[styles.background, { backgroundColor: theme.colors.background }]} />

                <SafeAreaView style={styles.safeArea}>
                    {/* AudioConference handles actual audio */}
                    <AudioConference />

                    {/* Header: Topic and Timer */}
                    <Animated.View entering={FadeIn.delay(200)} style={styles.header}>
                        <View style={styles.headerGlass}>
                            <View style={styles.topicPill}>
                                <Ionicons name="chatbubbles" size={14} color={theme.colors.primary} />
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
                            <ActivityIndicator size="large" color={theme.colors.primary} />
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
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: theme.colors.border + '20',
        ...theme.shadows.small,
    },
    topicPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    topicText: {
        color: theme.colors.text.primary,
        fontSize: 14,
        fontWeight: '600',
    },
    waitingOverlay: {
        marginTop: 40,
        alignItems: 'center',
        gap: 12,
    },
    waitingText: {
        color: theme.colors.text.secondary,
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
        borderColor: 'white',
        ...theme.shadows.medium,
    },
    partnerInitial: {
        color: 'white',
        fontSize: 32,
        fontWeight: 'bold',
    },
    partnerName: {
        color: theme.colors.text.primary,
        fontSize: 22,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    statusText: {
        color: theme.colors.text.secondary,
        fontSize: 12,
        fontWeight: '600',
        marginTop: 4,
    },
    timerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.primary + '15',
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
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    transcriptContainer: {
        flex: 1,
        marginHorizontal: 16,
        marginBottom: 100, // Room for dock
        borderRadius: 24,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border + '20',
        overflow: 'hidden',
        ...theme.shadows.small,
    },
    transcriptHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border + '15',
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
        fontWeight: '700',
        flex: 1,
    },
    activeLabel: {
        backgroundColor: theme.colors.primary + '20',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    activeLabelText: {
        color: theme.colors.primary,
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
        backgroundColor: 'white',
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: theme.colors.border + '20',
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
        color: theme.colors.text.primary,
    },
    bubbleTime: {
        fontSize: 9,
        color: theme.colors.text.light,
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
        backgroundColor: 'white',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 35,
        borderWidth: 1,
        borderColor: theme.colors.border + '20',
        gap: 15,
        ...theme.shadows.large,
    },
    controlDivider: {
        width: 1,
        height: 30,
        backgroundColor: theme.colors.border + '20',
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
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border + '15',
    },
    controlIconDanger: {
        backgroundColor: theme.colors.error,
    },
    controlIconActive: {
        backgroundColor: theme.colors.primary,
    },
    controlLabel: {
        color: theme.colors.text.secondary,
        fontSize: 10,
        fontWeight: '600',
    },
});
