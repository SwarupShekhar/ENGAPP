import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Dimensions, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    FadeInUp,
    FadeInDown,
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
    withDelay,
} from 'react-native-reanimated';
import { useUser } from '@clerk/clerk-expo';
import { Audio } from 'expo-av';
import { theme } from '../theme/theme';
import { tutorApi } from '../api/tutor';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Typing Dots ──────────────────────────────────────────
function TypingDots() {
    const dot1 = useSharedValue(0);
    const dot2 = useSharedValue(0);
    const dot3 = useSharedValue(0);

    useEffect(() => {
        dot1.value = withRepeat(withSequence(withTiming(-6, { duration: 300 }), withTiming(0, { duration: 300 })), -1, false);
        dot2.value = withRepeat(withDelay(150, withSequence(withTiming(-6, { duration: 300 }), withTiming(0, { duration: 300 }))), -1, false);
        dot3.value = withRepeat(withDelay(300, withSequence(withTiming(-6, { duration: 300 }), withTiming(0, { duration: 300 }))), -1, false);
    }, []);

    const s1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
    const s2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
    const s3 = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));

    return (
        <View style={styles.typingRow}>
            <View style={[styles.miniAvatar, { backgroundColor: theme.colors.primary }]}>
                <Text style={styles.miniAvatarText}>P</Text>
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
    const isUser = item.speaker === 'user';
    return (
        <Animated.View
            entering={FadeInUp.delay(index * 80).springify()}
            style={[styles.bubbleRow, isUser ? styles.bubbleRowRight : styles.bubbleRowLeft]}
        >
            {!isUser && (
                <View style={[styles.miniAvatar, { backgroundColor: theme.colors.primary }]}>
                    <Text style={styles.miniAvatarText}>P</Text>
                </View>
            )}
            <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubblePartner]}>
                <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextPartner]}>
                    {item.text}
                </Text>
                {item.correction && (
                    <View style={styles.correctionBox}>
                        <View style={styles.correctionHeader}>
                            <Ionicons name="bulb" size={14} color="#FCD34D" />
                            <Text style={styles.correctionLabel}>Tip from Priya</Text>
                        </View>
                        <Text style={styles.correctionText}>
                            "{item.correction.wrong}" → "{item.correction.right}"
                        </Text>
                        {item.correction.explanation_hinglish && (
                            <Text style={styles.explanation}>{item.correction.explanation_hinglish}</Text>
                        )}
                    </View>
                )}
            </View>
            {isUser && (
                <View style={[styles.miniAvatar, { backgroundColor: theme.colors.primaryLight }]}>
                    <Ionicons name="person" size={16} color={theme.colors.primary} />
                </View>
            )}
        </Animated.View>
    );
}

// ─── Main Screen ──────────────────────────────────────────
export default function AITutorScreen({ navigation }: any) {
    const { user } = useUser();
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [turnCount, setTurnCount] = useState(0);
    const [transcript, setTranscript] = useState<any[]>([
        { id: 'welcome', speaker: 'ai', text: "Namaste! 🙏 I'm Priya, your English tutor. Aaj hum English practice karenge — just hold the mic and speak!" }
    ]);
    const scrollRef = useRef<ScrollView>(null);
    const recordingRef = useRef<Audio.Recording | null>(null);
    const soundRef = useRef<Audio.Sound | null>(null);
    const sessionIdRef = useRef<string | null>(null);

    // Pulse animation for mic
    const pulseScale = useSharedValue(1);
    const pulseOpacity = useSharedValue(0.2);

    useEffect(() => {
        pulseScale.value = withRepeat(withTiming(1.5, { duration: 1200 }), -1, true);
        pulseOpacity.value = withRepeat(withTiming(0, { duration: 1200 }), -1, true);

        const init = async () => {
            try {
                const res = await tutorApi.startSession(user?.id || '');
                setSessionId(res.sessionId);
                sessionIdRef.current = res.sessionId;
                if (res.message) {
                    setTranscript([{ id: 'welcome', speaker: 'ai', text: res.message }]);
                }
            } catch (e) {
                console.error('Failed to start AI session', e);
                setError('Could not connect to Priya. Please try again.');
            }
        };
        init();

        return () => {
            // Cleanup: end session and unload audio
            if (sessionIdRef.current) {
                tutorApi.endSession(sessionIdRef.current).catch(() => {});
            }
            if (soundRef.current) {
                soundRef.current.unloadAsync().catch(() => {});
            }
        };
    }, []);

    const animatedPulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
        opacity: pulseOpacity.value,
    }));

    const startRecording = async () => {
        if (isProcessing) return;
        setError(null);
        try {
            await Audio.requestPermissionsAsync();
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            recordingRef.current = recording;
            setIsRecording(true);
        } catch (err) {
            console.error('Failed to start recording', err);
            setError('Microphone access denied. Please enable it in Settings.');
        }
    };

    const stopRecording = async () => {
        if (!recordingRef.current) return;
        setIsRecording(false);
        setIsProcessing(true);
        setError(null);

        try {
            await recordingRef.current.stopAndUnloadAsync();
            const uri = recordingRef.current.getURI();

            const formData = new FormData();
            formData.append('audio', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);
            formData.append('sessionId', sessionId || '');
            formData.append('userId', user?.id || '');

            const res = await tutorApi.processSpeech(formData);

            const newTurn = turnCount + 1;
            setTurnCount(newTurn);

            setTranscript(prev => [
                ...prev,
                { id: `user-${newTurn}`, speaker: 'user', text: res.transcription },
                {
                    id: `ai-${newTurn}`,
                    speaker: 'ai',
                    text: res.aiResponse,
                    correction: res.correction,
                },
            ]);

            // Play AI response audio
            if (res.audioBase64) {
                await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
                const sound = new Audio.Sound();
                await sound.loadAsync({ uri: `data:audio/mp3;base64,${res.audioBase64}` });
                if (soundRef.current) await soundRef.current.unloadAsync().catch(() => {});
                soundRef.current = sound;
                await sound.playAsync();
            }
        } catch (e: any) {
            console.error('Failed to process speech', e);
            setError(e?.message?.includes('timeout') 
                ? 'Response took too long. Please try again.'
                : 'Something went wrong. Please try again.');
        } finally {
            setIsProcessing(false);
            recordingRef.current = null;
        }
    };

    const handleEndSession = useCallback(() => {
        Alert.alert(
            'End Session',
            `You had ${turnCount} exchanges with Priya. End now?`,
            [
                { text: 'Continue', style: 'cancel' },
                {
                    text: 'End',
                    style: 'destructive',
                    onPress: () => navigation.goBack(),
                },
            ]
        );
    }, [turnCount, navigation]);

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#0F172A', '#1E293B', '#111827']} style={styles.background} />
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <Animated.View entering={FadeInDown.springify()} style={styles.header}>
                    <TouchableOpacity onPress={handleEndSession} style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={22} color="white" />
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                        <LinearGradient
                            colors={theme.colors.gradients.premium}
                            style={styles.headerAvatar}
                        >
                            <Text style={styles.headerAvatarText}>P</Text>
                        </LinearGradient>
                        <View>
                            <Text style={styles.headerTitle}>Priya</Text>
                            <Text style={styles.headerSubtitle}>AI English Tutor</Text>
                        </View>
                    </View>
                    <TouchableOpacity onPress={handleEndSession} style={styles.endBtn}>
                        <Text style={styles.endBtnText}>End</Text>
                    </TouchableOpacity>
                </Animated.View>

                {/* Turn Counter */}
                {turnCount > 0 && (
                    <View style={styles.turnBadge}>
                        <Ionicons name="chatbubbles" size={12} color={theme.colors.primaryLight} />
                        <Text style={styles.turnText}>{turnCount} exchange{turnCount !== 1 ? 's' : ''}</Text>
                    </View>
                )}

                {/* Error Banner */}
                {error && (
                    <Animated.View entering={FadeInDown.springify()} style={styles.errorBanner}>
                        <Ionicons name="warning" size={16} color="#FCD34D" />
                        <Text style={styles.errorText}>{error}</Text>
                        <TouchableOpacity onPress={() => setError(null)}>
                            <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
                        </TouchableOpacity>
                    </Animated.View>
                )}

                {/* Transcript */}
                <ScrollView
                    ref={scrollRef}
                    style={styles.transcriptScroll}
                    contentContainerStyle={styles.transcriptContent}
                    onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
                    showsVerticalScrollIndicator={false}
                >
                    {transcript.map((item, index) => (
                        <TranscriptBubble key={item.id} item={item} index={index} />
                    ))}
                    {isProcessing && <TypingDots />}
                </ScrollView>

                {/* Footer */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        onPressIn={startRecording}
                        onPressOut={stopRecording}
                        activeOpacity={0.8}
                        disabled={isProcessing}
                    >
                        <View style={styles.micContainer}>
                            {isRecording && <Animated.View style={[styles.pulse, animatedPulseStyle]} />}
                            <LinearGradient
                                colors={
                                    isRecording
                                        ? [theme.colors.error, '#EF4444'] as const
                                        : isProcessing
                                            ? ['#475569', '#64748B'] as const
                                            : theme.colors.gradients.primary
                                }
                                style={styles.micButton}
                            >
                                {isProcessing ? (
                                    <ActivityIndicator color="white" size="small" />
                                ) : (
                                    <Ionicons name={isRecording ? 'stop' : 'mic'} size={30} color="white" />
                                )}
                            </LinearGradient>
                        </View>
                    </TouchableOpacity>
                    <Text style={styles.footerHint}>
                        {isProcessing
                            ? 'Processing...'
                            : isRecording
                                ? '🔴 Release to send'
                                : 'Hold to speak'}
                    </Text>
                </View>
            </SafeAreaView>
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1 },
    background: { ...StyleSheet.absoluteFillObject },
    safeArea: { flex: 1 },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.08)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerCenter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerAvatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerAvatarText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
    headerTitle: {
        color: 'white',
        fontSize: 17,
        fontWeight: 'bold',
    },
    headerSubtitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
    },
    endBtn: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 14,
        backgroundColor: 'rgba(244,63,94,0.15)',
    },
    endBtnText: {
        color: theme.colors.error,
        fontWeight: '600',
        fontSize: 13,
    },

    // Turn badge
    turnBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginBottom: 4,
    },
    turnText: {
        color: theme.colors.primaryLight,
        fontSize: 12,
        fontWeight: '500',
    },

    // Error
    errorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginBottom: 8,
        padding: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(245,158,11,0.12)',
        gap: 8,
    },
    errorText: {
        flex: 1,
        color: '#FCD34D',
        fontSize: 13,
    },

    // Transcript
    transcriptScroll: { flex: 1 },
    transcriptContent: { padding: 16, gap: 12 },
    bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    bubbleRowLeft: { justifyContent: 'flex-start' },
    bubbleRowRight: { justifyContent: 'flex-end' },
    miniAvatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
    },
    miniAvatarText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
    bubble: {
        maxWidth: SCREEN_WIDTH * 0.72,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 18,
    },
    bubbleUser: {
        backgroundColor: theme.colors.primary,
        borderBottomRightRadius: 4,
    },
    bubblePartner: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderBottomLeftRadius: 4,
    },
    bubbleText: { fontSize: 15, lineHeight: 21 },
    bubbleTextUser: { color: 'white' },
    bubbleTextPartner: { color: '#E2E8F0' },

    // Correction box
    correctionBox: {
        marginTop: 8,
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.25)',
        borderRadius: 10,
        borderLeftWidth: 3,
        borderLeftColor: '#FCD34D',
    },
    correctionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    correctionLabel: {
        color: '#FCD34D',
        fontSize: 12,
        fontWeight: '700',
    },
    correctionText: {
        color: 'white',
        fontSize: 13,
        marginTop: 2,
    },
    explanation: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 12,
        fontStyle: 'italic',
        marginTop: 4,
    },

    // Typing dots
    typingRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
    },
    typingBubble: {
        flexDirection: 'row',
        gap: 4,
        backgroundColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 18,
        borderBottomLeftRadius: 4,
    },
    dot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: 'rgba(255,255,255,0.4)',
    },

    // Footer
    footer: { alignItems: 'center', paddingVertical: 20, paddingBottom: 32 },
    micContainer: {
        width: 82,
        height: 82,
        justifyContent: 'center',
        alignItems: 'center',
    },
    micButton: {
        width: 66,
        height: 66,
        borderRadius: 33,
        justifyContent: 'center',
        alignItems: 'center',
        ...theme.shadows.primaryGlow,
    },
    pulse: {
        position: 'absolute',
        width: 82,
        height: 82,
        borderRadius: 41,
        backgroundColor: theme.colors.error,
    },
    footerHint: {
        color: 'rgba(255,255,255,0.45)',
        marginTop: 10,
        fontSize: 13,
        fontWeight: '500',
    },
});
