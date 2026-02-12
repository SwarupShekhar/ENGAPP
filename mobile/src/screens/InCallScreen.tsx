import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Dimensions, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp, SlideInRight } from 'react-native-reanimated';
import { theme } from '../theme/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Mock Transcript Data ──────────────────────────────────
const MOCK_TRANSCRIPT = [
    { id: '1', speaker: 'partner', text: "Hi! So today let's talk about travel. Have you been anywhere recently?", time: '0:05' },
    { id: '2', speaker: 'user', text: "Yes, I goed to Goa last month with my family.", time: '0:12' },
    { id: '3', speaker: 'partner', text: "Oh nice! What did you like most about Goa?", time: '0:18' },
    { id: '4', speaker: 'user', text: "I liked the beaches very much. The water was very beautiful and clean.", time: '0:28' },
    { id: '5', speaker: 'partner', text: "That sounds amazing! Did you try any local food there?", time: '0:35' },
    { id: '6', speaker: 'user', text: "Yes, I eated fish curry and it was very delicious. The restaurants near the beach are very good.", time: '0:48' },
    { id: '7', speaker: 'partner', text: "I love seafood! How long did you stay?", time: '0:55' },
    { id: '8', speaker: 'user', text: "We stayed for five days. It was not enough time to see everything.", time: '1:05' },
];

// ─── Transcript Bubble ────────────────────────────────────
function TranscriptBubble({ item, index }: { item: typeof MOCK_TRANSCRIPT[0]; index: number }) {
    const isUser = item.speaker === 'user';
    return (
        <Animated.View
            entering={SlideInRight.delay(index * 300 + 1000).springify()}
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
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeaker, setIsSpeaker] = useState(false);
    const [visibleMessages, setVisibleMessages] = useState(0);
    const scrollRef = useRef<ScrollView>(null);

    const partnerName = route?.params?.partnerName || 'Sarah M.';
    const topic = route?.params?.topic || 'Travel';

    // Timer
    useEffect(() => {
        const interval = setInterval(() => {
            setDuration(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Simulate transcript messages appearing
    useEffect(() => {
        if (visibleMessages < MOCK_TRANSCRIPT.length) {
            const timeout = setTimeout(() => {
                setVisibleMessages(prev => prev + 1);
            }, 3000);
            return () => clearTimeout(timeout);
        }
    }, [visibleMessages]);

    // Auto-scroll transcript
    useEffect(() => {
        setTimeout(() => {
            scrollRef.current?.scrollToEnd({ animated: true });
        }, 100);
    }, [visibleMessages]);

    const formatDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const handleEndCall = () => {
        navigation.replace('CallFeedback', {
            sessionId: 'mock-session-1',
            partnerName,
            topic,
            duration,
        });
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <LinearGradient
                colors={['#1a1a2e', '#16213e', '#0f3460']}
                style={styles.background}
            />

            <SafeAreaView style={styles.safeArea}>
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

                {/* Live Transcript */}
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
                        {MOCK_TRANSCRIPT.slice(0, visibleMessages).map((item, index) => (
                            <TranscriptBubble key={item.id} item={item} index={index} />
                        ))}
                        {visibleMessages === 0 && (
                            <Animated.View entering={FadeIn.delay(500)} style={styles.waitingContainer}>
                                <Ionicons name="mic-outline" size={32} color="rgba(255,255,255,0.3)" />
                                <Text style={styles.waitingText}>Listening...</Text>
                            </Animated.View>
                        )}
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
        </View>
    );
}

// ─── Styles ────────────────────────────────────────────────
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

    // Header
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

    // Partner
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

    // Transcript
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

    // Bubbles
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

    // Waiting
    waitingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.xxl,
        gap: theme.spacing.s,
    },
    waitingText: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: theme.typography.sizes.m,
    },

    // Controls
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
