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
import { streamingTutor, StreamChunk } from '../services/streamingTutorService';

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
    const [isProcessing, setIsProcessing] = useState(false); // Transcribing...
    const [isStreaming, setIsStreaming] = useState(false); // Receiving AI response
    const [error, setError] = useState<string | null>(null);
    const [turnCount, setTurnCount] = useState(0);
    const [transcript, setTranscript] = useState<any[]>([
        { id: 'welcome', speaker: 'ai', text: "Namaste! 🙏 I'm Priya. Hold the mic to speak!" }
    ]);

    const scrollRef = useRef<ScrollView>(null);
    const recordingRef = useRef<Audio.Recording | null>(null);
    const audioQueueRef = useRef<string[]>([]);
    const isPlayingRef = useRef(false);
    const soundRef = useRef<Audio.Sound | null>(null);

    // Pulse
    const pulseScale = useSharedValue(1);
    const pulseOpacity = useSharedValue(0.2);

    useEffect(() => {
        pulseScale.value = withRepeat(withTiming(1.5, { duration: 1200 }), -1, true);
        pulseOpacity.value = withRepeat(withTiming(0, { duration: 1200 }), -1, true);

        // Start Session
        const init = async () => {
            try {
                // Request Permission First
                const perm = await Audio.requestPermissionsAsync();
                if (perm.status !== 'granted') {
                    Alert.alert('Permission Required', 'Microphone access is needed for the AI Tutor.');
                    return; 
                }

                const res = await tutorApi.startSession(user?.id || 'test');
                setSessionId(res.sessionId);
                
                // Connect WebSocket
                streamingTutor.connect(res.sessionId, user?.id || 'test');
                streamingTutor.onMessage(handleStreamMessage);
                
                if (res.audioBase64) {
                    queueAudio(res.audioBase64);
                }
            } catch (e) {
                console.error('Init error:', e);
                setError('Failed to connect.');
            }
        };
        init();

        return () => {
            streamingTutor.disconnect();
            if (soundRef.current) soundRef.current.unloadAsync();
        };
    }, []);

    // ─── Stream Handling ────────────────────────────────────
    const handleStreamMessage = (chunk: StreamChunk) => {
        if (chunk.type === 'sentence') {
            setIsStreaming(true);
            if (chunk.text) {
                setTranscript(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.speaker === 'ai' && last.isStreaming) {
                        const updated = [...prev];
                        updated[updated.length - 1] = {
                            ...last,
                            text: last.text + ' ' + chunk.text
                        };
                        return updated;
                    } else {
                        return [...prev, {
                            id: Date.now().toString(),
                            speaker: 'ai',
                            text: chunk.text,
                            isStreaming: true
                        }];
                    }
                });
            }
        }

        // Always check for audio in any chunk
        if (chunk.audio) {
            queueAudio(chunk.audio);
        }
    };

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
            const { sound } = await Audio.Sound.createAsync(
                { uri: `data:audio/mp3;base64,${nextAudio}` },
                { shouldPlay: true }
            );
            soundRef.current = sound;
            sound.setOnPlaybackStatusUpdate((status) => {
                if (status.isLoaded && status.didJustFinish) {
                    isPlayingRef.current = false;
                    playNext();
                }
            });
        } catch (e) {
            console.error('Play error', e);
            isPlayingRef.current = false;
            playNext();
        }
    };

    // ─── Recording ──────────────────────────────────────────
    const startRecording = async () => {
        if (isProcessing || isStreaming) return; // Block while streaming
        try {
            const perm = await Audio.requestPermissionsAsync();
            if (perm.status !== 'granted') {
                Alert.alert('Permission Required', 'Please enable microphone access locally.');
                return;
            }

            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            recordingRef.current = recording;
            setIsRecording(true);
        } catch (e) {
            console.error('Rec error', e);
        }
    };

    const stopRecording = async () => {
        if (!recordingRef.current) return;
        setIsRecording(false);
        setIsProcessing(true);

        try {
            await recordingRef.current.stopAndUnloadAsync();
            const uri = recordingRef.current.getURI();
            
            if (uri) {
                // 1. Transcribe
                const formData = new FormData();
                formData.append('audio', { uri, type: 'audio/m4a', name: 'audio.m4a' } as any);
                formData.append('userId', user?.id || 'test');
                
                const res = await tutorApi.transcribe(formData);
                const text = res.text;

                // 2. Add User Bubble
                setTranscript(prev => [...prev, {
                    id: Date.now().toString(),
                    speaker: 'user',
                    text: text
                }]);

                // 3. Send to Stream
                streamingTutor.sendText(text);
                setTurnCount(c => c + 1);
            }
        } catch (e) {
            console.error('Process error', e);
            setError('Could not process speech.');
        } finally {
            setIsProcessing(false);
            // setIsStreaming(true) happens on first chunk
        }
    };

    // Animation
    const animatedPulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
        opacity: pulseOpacity.value,
    }));

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#0F172A', '#1E293B', '#111827']} style={styles.background} />
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Ionicons name="chevron-back" size={24} color="white" />
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                         <View style={styles.onlineBadge} />
                         <Text style={styles.headerTitle}>Priya (Streaming)</Text>
                    </View>
                </View>

                {/* Chat */}
                <ScrollView 
                    ref={scrollRef}
                    style={styles.transcriptScroll}
                    contentContainerStyle={styles.transcriptContent}
                    onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
                >
                    {transcript.map((item, i) => (
                        <TranscriptBubble key={item.id} item={item} index={i} />
                    ))}
                    {(isProcessing || (isStreaming && !transcript[transcript.length-1]?.text)) && <TypingDots />}
                </ScrollView>

                {/* Footer Controls */}
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
                                colors={isRecording ? ['#ef4444', '#dc2626'] : ['#3b82f6', '#2563eb']}
                                style={styles.micButton}
                            >
                                <Ionicons name={isRecording ? "stop" : "mic"} size={28} color="white" />
                            </LinearGradient>
                        </View>
                    </TouchableOpacity>
                    <Text style={styles.hintText}>
                        {isProcessing ? 'Transcribing...' : isRecording ? 'Release to Send' : 'Hold to Speak'}
                    </Text>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    background: { ...StyleSheet.absoluteFillObject },
    safeArea: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    backBtn: { padding: 8 },
    headerCenter: { flexDirection: 'row', alignItems: 'center', marginLeft: 10, gap: 8 },
    onlineBadge: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' },
    headerTitle: { color: 'white', fontWeight: 'bold', fontSize: 18 },
    transcriptScroll: { flex: 1 },
    transcriptContent: { padding: 16, gap: 12, paddingBottom: 100 },
    
    // Bubbles
    bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    bubbleRowLeft: { justifyContent: 'flex-start' },
    bubbleRowRight: { justifyContent: 'flex-end' },
    miniAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    miniAvatarText: { color: 'white', fontWeight: 'bold', fontSize: 12 },
    bubble: { maxWidth: SCREEN_WIDTH * 0.75, padding: 12, borderRadius: 16 },
    bubbleUser: { backgroundColor: theme.colors.primary, borderBottomRightRadius: 2 },
    bubblePartner: { backgroundColor: 'rgba(255,255,255,0.1)', borderBottomLeftRadius: 2 },
    bubbleText: { color: 'white', fontSize: 16, lineHeight: 22 },
    bubbleTextUser: { color: 'white' },
    bubbleTextPartner: { color: '#e2e8f0' },

    // Footer
    footer: { alignItems: 'center', paddingBottom: 40 },
    micContainer: { width: 72, height: 72, justifyContent: 'center', alignItems: 'center' },
    micButton: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', zIndex: 2 },
    pulse: { position: 'absolute', width: '100%', height: '100%', borderRadius: 40, backgroundColor: 'rgba(239, 68, 68, 0.5)' },
    hintText: { color: 'rgba(255,255,255,0.5)', marginTop: 12, fontSize: 14 },

    // Typing
    typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
    typingBubble: { flexDirection: 'row', gap: 4, padding: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, borderBottomLeftRadius: 2 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
});
