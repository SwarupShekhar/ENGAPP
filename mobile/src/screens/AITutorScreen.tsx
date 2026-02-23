import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Dimensions, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
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
import { PronunciationBreakdown } from '../components/PronunciationBreakdown';

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
    const isUser = item.speaker === 'user';
    return (
        <Animated.View
            entering={FadeInUp.delay(index * 80).springify().damping(15)}
            style={[{ width: '100%', marginBottom: 16 }, isUser ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}
        >
            <View style={[styles.bubbleRow, isUser ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
                {!isUser && (
                    <View style={styles.avatarContainer}>
                        <View style={styles.avatarGlow} />
                        <LinearGradient colors={['#6366f1', '#a855f7']} style={styles.miniAvatar}>
                            <Text style={styles.miniAvatarText}>M</Text>
                        </LinearGradient>
                    </View>
                )}
                
                <View style={[styles.bubbleWrapper, isUser ? styles.bubbleWrapperUser : styles.bubbleWrapperPartner]}>
                    {isUser ? (
                        <View style={[styles.bubble, styles.bubbleUser]}>
                            <Text style={[styles.bubbleText, styles.bubbleTextUser]}>
                                {item.text}
                            </Text>
                        </View>
                    ) : (
                        <BlurView intensity={25} tint="dark" style={[styles.bubble, styles.bubblePartner]}>
                            <Text style={[styles.bubbleText, styles.bubbleTextPartner]}>
                                {item.text}
                            </Text>
                        </BlurView>
                    )}
                </View>

                {isUser && (
                    <View style={styles.userAvatarContainer}>
                        <LinearGradient colors={['#3b82f6', '#2dd4bf']} style={styles.miniAvatar}>
                            <Ionicons name="person" size={14} color="white" />
                        </LinearGradient>
                    </View>
                )}
            </View>
            {isUser && item.assessmentResult && (
                <View style={{ width: '90%', marginTop: 8 }}>
                    <PronunciationBreakdown result={item.assessmentResult} />
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
    const [referenceTextForNextTurn, setReferenceTextForNextTurn] = useState<string | null>(null);
    const [transcript, setTranscript] = useState<any[]>([]);

    const sessionIdRef = useRef<string | null>(null);
    const scrollRef = useRef<ScrollView>(null);
    const recordingRef = useRef<Audio.Recording | null>(null);
    const audioQueueRef = useRef<string[]>([]);
    const isPlayingRef = useRef(false);
    const soundRef = useRef<Audio.Sound | null>(null);

    // VAD Refs
    const silenceStartRef = useRef<number | null>(null);
    const isSpeakingRef = useRef(false);
    const silenceThresholdDb = -50; // Silence threshold
    const speechThresholdDb = -45; // Speech threshold
    const silenceDurationMs = 2000; // 2 seconds to trigger end

    // Pulse Rings
    const pulseScale1 = useSharedValue(1);
    const pulseOpacity1 = useSharedValue(0);
    const pulseScale2 = useSharedValue(1);
    const pulseOpacity2 = useSharedValue(0);

    useEffect(() => {
        pulseScale1.value = withRepeat(withTiming(1.6, { duration: 1500 }), -1, false);
        pulseOpacity1.value = withRepeat(withSequence(withTiming(0.4, { duration: 0 }), withTiming(0, { duration: 1500 })), -1, false);

        pulseScale2.value = withRepeat(withDelay(750, withTiming(1.6, { duration: 1500 })), -1, false);
        pulseOpacity2.value = withRepeat(withDelay(750, withSequence(withTiming(0.3, { duration: 0 }), withTiming(0, { duration: 1500 }))), -1, false);

        // Initialize Session

        // Start Session
        const init = async () => {
            try {
                // 1. Show immediate joining bubble to eliminate perceived lag
                const initialName = user?.firstName || 'Friend';
                setTranscript([{ 
                    id: 'welcome', 
                    speaker: 'ai', 
                    text: `Namaste ${initialName}! Maya is joining...` 
                }]);

                // 2. Parallelize Permission + API Call
                const [perm, res] = await Promise.all([
                    Audio.requestPermissionsAsync(),
                    tutorApi.startSession(user?.id || 'test')
                ]);

                if (perm.status !== 'granted') {
                    Alert.alert('Permission Required', 'Microphone access is needed.');
                    return; 
                }

                setSessionId(res.sessionId);
                sessionIdRef.current = res.sessionId;

                // 3. Update bubble with actual greeting
                setTranscript([{ 
                    id: 'welcome', 
                    speaker: 'ai', 
                    text: res.message 
                }]);
                
                // 4. Connect WebSocket + Setup Audio (non-blocking)
                streamingTutor.connect(res.sessionId, user?.id || 'test');
                streamingTutor.onMessage(handleStreamMessage);
                
                Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: false,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                }).catch(err => console.warn("Audio mode error:", err));

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
            if (recordingRef.current) stopRecording(); // Ensure recording stops
            
            // Trigger final analysis and save session
            if (sessionIdRef.current) {
                console.log("[AITutor] Ending session for analysis:", sessionIdRef.current);
                tutorApi.endSession(sessionIdRef.current).catch(err => {
                    console.warn("[AITutor] Failed to end session gracefully:", err.message);
                });
            }
        };
    }, []);

    // ─── Stream Handling ────────────────────────────────────
    const handleStreamMessage = (chunk: StreamChunk) => {
        if (chunk.type === 'transcription') {
            // Update the placeholder user bubble with the actual transcription
            if (chunk.text) {
                setTranscript(prev => {
                    const tempIndex = prev.findIndex(p => p.speaker === 'user' && p.tempId);
                    if (tempIndex >= 0) {
                        const updated = [...prev];
                        updated[tempIndex] = {
                            ...updated[tempIndex],
                            text: chunk.text,
                            assessmentResult: chunk.assessmentResult,
                            tempId: false,
                            isTranscribing: false
                        };
                        return updated;
                    }
                    // Fallback
                    return [...prev, {
                        id: Date.now().toString(),
                        speaker: 'user',
                        text: chunk.text,
                        assessmentResult: chunk.assessmentResult
                    }];
                });
            }
        } else if (chunk.type === 'sentence') {
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

        // --- NEW: Detect if Maya is asking the user to repeat something ---
        // Basic heuristic: check if the string contains a quoted phrase after words like "say", "saying", "repeat"
        if (chunk.text && chunk.is_final !== false) { // Wait for the chunk to assemble or just check the full string
            // We'll run the check on the accumulated string once we know the stream is done, 
            // but since chunk.text comes in pieces, we'll wait for the `playNext` queue finish to evaluate the whole last message.
        }
    };

    // Evaluate last message for repetition prompts
    const evaluateLastMessageForPronunciation = () => {
        if (transcript.length === 0) return;
        const lastMsg = transcript[transcript.length - 1];
        if (lastMsg.speaker !== 'ai') return;
        
        const txt = lastMsg.text.toLowerCase();
        
        // Match patterns like:
        // - "say: 'word'"
        // - "repeat after me: 'phrase'"
        // - "try saying 'this'"
        
        const match = lastMsg.text.match(/(?:say|saying|repeat|try|boli(?:ye|o))\s*(?:after me|this|say)?\s*[:,-]?\s*['"]([^'"]+)['"]/i);
        
        if (match && match[1]) {
            console.log("[Pronunciation] Detected reference text:", match[1]);
            setReferenceTextForNextTurn(match[1]);
        } else {
            // Check if user explicitly asked to practice
            const userMatch = lastMsg.text.match(/['"]([^'"]+)['"]/i); // Fallback: just grab quotes if it feels like a correction
            if (txt.includes('practice') && userMatch && userMatch[1]) {
                 console.log("[Pronunciation] Detected practice word:", userMatch[1]);
                 setReferenceTextForNextTurn(userMatch[1]);
            } else {
                 setReferenceTextForNextTurn(null);
            }
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
            if (!nextAudio) {
                isPlayingRef.current = false;
                playNext();
                return;
            }

            // Ensure mode allows playback
            await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
            
            const { sound } = await Audio.Sound.createAsync(
                { uri: `data:audio/mp3;base64,${nextAudio}` },
                { shouldPlay: true }
            );
            soundRef.current = sound;
            sound.setOnPlaybackStatusUpdate((status) => {
                if (status.isLoaded && status.didJustFinish) {
                    isPlayingRef.current = false;
                    playNext();
                    
                    if (audioQueueRef.current.length === 0) {
                        setIsStreaming(false); // Enable mic again
                        evaluateLastMessageForPronunciation(); // Check if we need to assess next
                    }
                }
            });
        } catch (e) {
            console.error('Play error', e);
            isPlayingRef.current = false;
            setIsStreaming(false); // Enable mic on error
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
        try {
            const perm = await Audio.requestPermissionsAsync();
            if (perm.status !== 'granted') return;

            // Switch to recording mode
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            
            // Validate previous recording is cleared
            if (recordingRef.current) {
                try { await recordingRef.current.stopAndUnloadAsync(); } catch(e) {}
                recordingRef.current = null;
            }
            const { recording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY,
                (status) => {
                    if (status.metering !== undefined) {
                        const level = status.metering;
                        
                        // Check for speech
                        if (level > speechThresholdDb) {
                            isSpeakingRef.current = true;
                            silenceStartRef.current = null; // Reset silence timer
                        } 
                        
                        // Check for silence
                        if (level < silenceThresholdDb && isSpeakingRef.current) {
                            if (silenceStartRef.current === null) {
                                silenceStartRef.current = Date.now();
                            } else {
                                const silenceDuration = Date.now() - silenceStartRef.current;
                                if (silenceDuration > silenceDurationMs) {
                                    // User finished speaking
                                    stopRecording();
                                    isSpeakingRef.current = false;
                                    silenceStartRef.current = null;
                                }
                            }
                        }
                    }
                },
                100 // Metering interval ms
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
            // Check status first if possible, or just try-catch the unload
            try {
                const status = await recordingRef.current.getStatusAsync();
                if (status.isRecording) {
                    await recordingRef.current.stopAndUnloadAsync();
                } else if (status.isDoneRecording) {
                     // Already stopped, just unload if not unloaded
                     // But getStatusAsync might throw if unloaded? 
                     // easiest is just robust try-catch on stopAndUnloadAsync
                     await recordingRef.current.stopAndUnloadAsync();
                }
            } catch (unloadError: any) {
                // Ignore "already unloaded" error
                if (!unloadError.message?.includes('already been unloaded')) {
                     console.log('Unload error (ignoring):', unloadError);
                }
            }
            
            const uri = recordingRef.current.getURI();
             recordingRef.current = null; // Clear ref immediately to prevent double calls
            
            if (uri) {
                // 1. Prepare Audio Base64 (always needed now)
                let audioBase64: string | undefined;
                try {
                    const FileSystem = require('expo-file-system');
                    audioBase64 = await FileSystem.readAsStringAsync(uri, { 
                        encoding: FileSystem.EncodingType.Base64 
                    });
                } catch (e) {
                    console.warn('[AITutor] Could not read audio file:', e);
                }

                if (referenceTextForNextTurn && sessionId) {
                    // Route to specialized pronunciation assessment (REST)
                    const formData = new FormData();
                    formData.append('audio', { uri, type: 'audio/m4a', name: 'audio.m4a' } as any);
                    formData.append('userId', user?.id || 'test');
                    formData.append('referenceText', referenceTextForNextTurn);
                    formData.append('sessionId', sessionId);
                    console.log("[AITutor] Assessing pronunciation for:", referenceTextForNextTurn);
                    
                    const res = await tutorApi.assessPronunciation(formData);
                    const text = res.recognized_text || referenceTextForNextTurn; // Try to use STT result if any
                    const phoneticContext = res.phonetic_insights;
                    const assessmentData = res;
                    
                    // Clear reference text after use
                    setReferenceTextForNextTurn(null);

                    // Add User Bubble
                    setTranscript(prev => [...prev, {
                        id: Date.now().toString(),
                        speaker: 'user',
                        text: text || '(Audio Sent)',
                        assessmentResult: assessmentData
                    }]);

                    // Send to Stream (include raw audio for Gemini analysis)
                    streamingTutor.sendText(text, phoneticContext, audioBase64);
                } else {
                    // Fast path: Standard conversation via WebSocket directly!
                    
                    // 1. Add Placeholder User Bubble
                    setTranscript(prev => [...prev, {
                        id: Date.now().toString(),
                        speaker: 'user',
                        text: '...', // Will be updated by WS transcription event
                        tempId: true
                    }]);

                    // 2. Send raw audio straight to the WS, no REST!
                    if (audioBase64) {
                        streamingTutor.sendText(null, null, audioBase64);
                    }
                }
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
            <LinearGradient colors={['#0F0C29', '#302B63', '#0F0C29']} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={styles.background} />
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
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
                                    // Make sure we go to the feedback screen instead of just back
                                    navigation.replace('CallFeedbackScreen', {
                                        sessionId: sessionIdRef.current,
                                        clerkId: user?.id,
                                        partnerInfo: {
                                            id: 'maya',
                                            fname: 'Maya',
                                            lname: '(AI Tutor)'
                                        },
                                        isAI: true
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
                        disabled={isProcessing || isStreaming}
                    >
                        <View style={[styles.micContainer, (isProcessing || isStreaming) && { opacity: 0.5 }]}>
                            {isRecording && (
                                <>
                                    <Animated.View style={[styles.pulse, animatedPulseStyle1]} />
                                    <Animated.View style={[styles.pulse, animatedPulseStyle2]} />
                                </>
                            )}
                            <LinearGradient
                                colors={isRecording ? ['#ef4444', '#dc2626'] : ['#6366f1', '#a855f7']}
                                style={[styles.micButton, isRecording && styles.micButtonRecording]}
                            >
                                <Ionicons name={isRecording ? "stop" : "mic"} size={28} color="white" />
                            </LinearGradient>
                        </View>
                    </TouchableOpacity>
                    <Text style={styles.hintText}>
                        {isProcessing ? 'Thinking...' : isStreaming ? 'Maya is speaking...' : isRecording ? 'Listening...' : 'Hold to Speak'}
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
    onlineBadge: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981', shadowColor: '#10b981', shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
    headerTitle: { color: 'white', fontWeight: 'bold', fontSize: 18, letterSpacing: 0.5 },
    endSessionBtn: { 
        backgroundColor: 'rgba(239, 68, 68, 0.15)', 
        paddingHorizontal: 16, 
        paddingVertical: 8, 
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.4)'
    },
    endSessionText: { color: '#ef4444', fontWeight: '600', fontSize: 13 },
    transcriptScroll: { flex: 1 },
    transcriptContent: { padding: 16, gap: 16, paddingBottom: 100 },
    
    // Bubbles
    bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
    bubbleRowLeft: { justifyContent: 'flex-start' },
    bubbleRowRight: { justifyContent: 'flex-end' },
    avatarContainer: { position: 'relative', width: 32, height: 32 },
    userAvatarContainer: { position: 'relative', width: 32, height: 32 },
    avatarGlow: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: 20, backgroundColor: '#a855f7', opacity: 0.4 },
    miniAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    miniAvatarText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
    bubbleWrapper: { maxWidth: SCREEN_WIDTH * 0.72, borderRadius: 20, overflow: 'hidden' },
    bubbleWrapperUser: { borderBottomRightRadius: 4, shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
    bubbleWrapperPartner: { borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
    bubble: { paddingHorizontal: 16, paddingVertical: 12 },
    bubbleUser: { backgroundColor: theme.colors.primary },
    bubblePartner: { backgroundColor: 'transparent' },
    bubbleText: { color: 'white', fontSize: 16, lineHeight: 24, letterSpacing: 0.2 },
    bubbleTextUser: { color: 'white' },
    bubbleTextPartner: { color: '#f8fafc' },

    // Footer
    footer: { alignItems: 'center', paddingBottom: 40 },
    micContainer: { width: 80, height: 80, justifyContent: 'center', alignItems: 'center' },
    micButton: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', zIndex: 2, shadowColor: '#a855f7', shadowOpacity: 0.4, shadowOffset: {width: 0, height: 4}, shadowRadius: 10},
    micButtonRecording: { shadowColor: '#ef4444', shadowOpacity: 0.6, shadowRadius: 15 },
    pulse: { position: 'absolute', width: '100%', height: '100%', borderRadius: 40, backgroundColor: 'rgba(239, 68, 68, 0.4)' },
    hintText: { color: 'rgba(255,255,255,0.7)', marginTop: 16, fontSize: 14, fontWeight: '500', letterSpacing: 0.5 },

    // Typing
    typingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 8 },
    typingBubble: { flexDirection: 'row', gap: 5, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.8)' },
});
