import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    Dimensions, Animated, Easing
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AnimatedRN, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useUser } from '@clerk/clerk-expo';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme/theme';
import { matchmakingApi } from '../api/matchmaking';
import { ActivityIndicator } from 'react-native';
import { FeatureLock } from '../components/FeatureLock';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Constants & Helpers ───────────────────────────────────

const getLevelScore = (levelStr?: string): number => {
    if (!levelStr) return 1;
    const map: { [key: string]: number } = {
        'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6
    };
    return map[levelStr.toUpperCase()] || 1;
};

// ─── Mock Data ─────────────────────────────────────────────
const SUGGESTED_TOPICS = [
    { label: 'Daily Routine', icon: '☀️' },
    { label: 'Travel Plans', icon: '✈️' },
    { label: 'Movies & TV', icon: '🎬' },
    { label: 'Food & Cooking', icon: '🍳' },
    { label: 'Technology', icon: '💻' },
    { label: 'Sports', icon: '⚽' },
    { label: 'Music', icon: '🎵' },
    { label: 'Books', icon: '📚' },
];

const MOCK_RECENT_CALLS = [
    {
        id: '1',
        partnerName: 'Sarah M.',
        topic: 'Daily Routine',
        duration: 720,
        score: 82,
        date: '2 hours ago',
    },
    {
        id: '2',
        partnerName: 'David L.',
        topic: 'Travel Plans',
        duration: 480,
        score: 75,
        date: 'Yesterday',
    },
    {
        id: '3',
        partnerName: 'Priya K.',
        topic: 'Movies & TV',
        duration: 600,
        score: 88,
        date: '2 days ago',
    },
];

// ─── Pulse Animation ──────────────────────────────────────
function PulseRing({ delay }: { delay: number }) {
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(0.4)).current;

    useEffect(() => {
        const animate = () => {
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.parallel([
                        Animated.timing(scale, {
                            toValue: 1.15,
                            duration: 2000,
                            easing: Easing.out(Easing.ease),
                            useNativeDriver: true,
                        }),
                        Animated.timing(opacity, {
                            toValue: 0,
                            duration: 2000,
                            useNativeDriver: true,
                        }),
                    ]),
                    Animated.parallel([
                        Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
                        Animated.timing(opacity, { toValue: 0.4, duration: 0, useNativeDriver: true }),
                    ]),
                ])
            ).start();
        };
        animate();
    }, []);

    return (
        <Animated.View
            style={[
                styles.pulseRing,
                { transform: [{ scaleX: scale }, { scaleY: scale }], opacity },
            ]}
        />
    );
}

// ─── Score Badge ──────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
    const color = score >= 80 ? theme.colors.success : score >= 60 ? theme.colors.warning : theme.colors.error;
    return (
        <View style={[styles.scoreBadge, { backgroundColor: color + '18' }]}>
            <Ionicons name="star" size={12} color={color} />
            <Text style={[styles.scoreBadgeText, { color }]}>{score}</Text>
        </View>
    );
}

// ─── Topic Chip ───────────────────────────────────────────
function TopicChip({ label, icon, selected, onPress }: {
    label: string; icon: string; selected: boolean; onPress: () => void;
}) {
    return (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={onPress}
            style={[styles.topicChip, selected && styles.topicChipSelected]}
        >
            <Text style={styles.topicIcon}>{icon}</Text>
            <Text style={[styles.topicText, selected && styles.topicTextSelected]}>{label}</Text>
        </TouchableOpacity>
    );
}

// ─── Recent Call Card ─────────────────────────────────────
function RecentCallCard({ item, onPress }: { item: typeof MOCK_RECENT_CALLS[0]; onPress: () => void }) {
    const minutes = Math.floor(item.duration / 60);
    return (
        <TouchableOpacity style={styles.callCard} activeOpacity={0.7} onPress={onPress}>
            <View style={styles.callCardAvatar}>
                <LinearGradient
                    colors={theme.colors.gradients.primary}
                    style={styles.avatarGradient}
                >
                    <Text style={styles.avatarText}>
                        {item.partnerName.charAt(0)}
                    </Text>
                </LinearGradient>
            </View>
            <View style={styles.callCardInfo}>
                <Text style={styles.callPartnerName}>{item.partnerName}</Text>
                <Text style={styles.callMeta}>
                    {item.topic} · {minutes} min · {item.date}
                </Text>
            </View>
            <ScoreBadge score={item.score} />
        </TouchableOpacity>
    );
}

// ─── Main Component ───────────────────────────────────────
export default function CallScreen() {
    const { user } = useUser();
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [showAiOption, setShowAiOption] = useState(false);
    const [isStructured, setIsStructured] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const meta = (user?.unsafeMetadata || {}) as any;
    const userLevel = meta.assessmentLevel || 'B1';
    const userLevelNum = getLevelScore(userLevel);

    const navigation: any = useNavigation();
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
        };
    }, []);

    const cleanupMatchmaking = () => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
        if (safetyTimeoutRef.current) {
            clearTimeout(safetyTimeoutRef.current);
            safetyTimeoutRef.current = null;
        }
    };

    const handleFindPartner = async () => {
        if (!user) return;

        cleanupMatchmaking();
        setIsSearching(true);
        setError(null);

        try {
            if (isStructured) {
                // ── Structured Matchmaking (Progressive) ──
                const result = await matchmakingApi.findStructured(
                    user.id, 
                    'ielts_speaking'
                );

                setIsSearching(false);

                if (result.matched && result.partnerId && result.sessionId) {
                    navigation.replace('InCall', {
                        sessionId: result.sessionId,
                        partnerId: result.partnerId,
                        mode: 'structured'
                    });
                } else {
                    setShowAiOption(true);
                }

            } else {
                // ── Free Talk (Queue & Poll) ──
                await matchmakingApi.join({
                    userId: user.id,
                    englishLevel: userLevel,
                    topic: selectedTopic || 'general'
                });

                // Start Polling
                pollIntervalRef.current = setInterval(async () => {
                    try {
                        const status = await matchmakingApi.checkStatus(user.id, userLevel);
                        if (status.matched && status.sessionId) {
                            cleanupMatchmaking();
                            setIsSearching(false);
                            navigation.replace('InCall', {
                                sessionId: status.sessionId,
                                roomName: status.roomName,
                                partnerId: status.partnerId,
                                partnerName: status.partnerName,
                                topic: selectedTopic || 'general'
                            });
                        } else if (status.message) {
                            cleanupMatchmaking();
                            setIsSearching(false);
                            setShowAiOption(true);
                        }
                    } catch (error) {
                        console.error('[Matchmaking] Poll error:', error);
                    }
                }, 3000);

                // Safety timeout
                safetyTimeoutRef.current = setTimeout(() => {
                    cleanupMatchmaking();
                    if (isSearching) {
                        setIsSearching(false);
                        setShowAiOption(true);
                    }
                }, 45000); 
            }
        } catch (error) {
            console.error('[Matchmaking] Join failed:', error);
            setIsSearching(false);
            cleanupMatchmaking();
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={MOCK_RECENT_CALLS}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                ListHeaderComponent={
                    <>
                        {/* Header */}
                        <AnimatedRN.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
                            <View>
                                <Text style={styles.title}>Practice</Text>
                                <Text style={styles.subtitle}>Find a partner to practice with</Text>
                            </View>
                            <View style={styles.levelBadge}>
                                <Ionicons name="trophy" size={14} color={theme.colors.primary} />
                                <Text style={styles.levelText}>{userLevel}</Text>
                            </View>
                        </AnimatedRN.View>

                        {/* Find Partner Button Area */}
                        <AnimatedRN.View entering={FadeInDown.delay(200).springify()} style={styles.findPartnerContainer}>
                            
                            {/* Mode Toggle */}
                            <View style={styles.modeToggle}>
                                <TouchableOpacity 
                                    style={[styles.modeBtn, !isStructured && styles.modeBtnActive]}
                                    onPress={() => setIsStructured(false)}
                                >
                                    <Text style={[styles.modeText, !isStructured && styles.modeTextActive]}>Free Talk</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                    style={[styles.modeBtn, isStructured && styles.modeBtnActive]}
                                    onPress={() => setIsStructured(true)}
                                >
                                    <Text style={[styles.modeText, isStructured && styles.modeTextActive]}>Structured</Text>
                                    <Ionicons name="lock-closed" size={12} color={isStructured ? 'white' : theme.colors.text.secondary} style={{marginLeft: 4, opacity: 0.7}} />
                                </TouchableOpacity>
                            </View>

                            <View style={[styles.pulseContainer, isStructured && styles.pulseContainerLocked]}>
                                {/* Feature Lock Overlay for Structured Mode */}
                                {isStructured && userLevelNum < 5 && (
                                    <FeatureLock 
                                        currentLevel={userLevelNum} 
                                        requiredLevel={5} 
                                    />
                                )}

                                {!showAiOption && !isStructured && !isSearching && (
                                    <>
                                        <PulseRing delay={0} />
                                        <PulseRing delay={700} />
                                        <PulseRing delay={1400} />
                                    </>
                                )}
                                <TouchableOpacity
                                    activeOpacity={0.85}
                                    onPress={showAiOption ? () => navigation.navigate('AITutor') : handleFindPartner}
                                    disabled={isSearching || (isStructured && userLevelNum < 5)}
                                    style={styles.findButtonWrapper}
                                >
                                    <LinearGradient
                                        colors={showAiOption 
                                            ? theme.colors.gradients.premium
                                            : isSearching
                                                ? [theme.colors.primaryLight, theme.colors.primary]
                                                : isStructured
                                                    ? ['#8B5CF6', '#7C3AED'] // Purple for structured
                                                    : ['#3b82f6', '#2563eb'] // Vivid blue for free talk
                                        }
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.findButton}
                                    >
                                        {isSearching ? (
                                            <>
                                                <ActivityIndicator color="white" size="small" />
                                                <Text style={styles.findButtonText}>
                                                    {isStructured ? 'Finding Match...' : 'Searching for Partner...'}
                                                </Text>
                                                {isStructured && (
                                                    <Text style={styles.searchHint}>Expanding criteria...</Text>
                                                )}
                                            </>
                                        ) : showAiOption ? (
                                            <>
                                                <Ionicons name="sparkles" size={24} color="white" />
                                                <Text style={styles.findButtonText}>Practice with Maya (AI)</Text>
                                            </>
                                        ) : (
                                            <>
                                                <Ionicons name={isStructured ? "school" : "call"} size={24} color="white" />
                                                <Text style={styles.findButtonText}>
                                                    {isStructured ? 'Start Practice Session' : 'Tap to Start Calling'}
                                                </Text>
                                            </>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>

                            {!isSearching && !showAiOption && (
                                <Text style={styles.callHintText}>Wait times are currently less than 30 seconds</Text>
                            )}
                            
                            {isSearching && (
                                <TouchableOpacity 
                                    onPress={() => {
                                        cleanupMatchmaking();
                                        setIsSearching(false);
                                    }}
                                    style={styles.cancelButton}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.cancelButtonText}>Cancel Search</Text>
                                </TouchableOpacity>
                            )}

                            {showAiOption && (
                                <TouchableOpacity 
                                    onPress={() => {
                                        setShowAiOption(false);
                                        handleFindPartner();
                                    }}
                                    style={styles.retryTextButton}
                                >
                                    <Text style={styles.retryText}>Or try searching again</Text>
                                </TouchableOpacity>
                            )}
                        </AnimatedRN.View>

                        {/* Suggested Topics */}
                        <AnimatedRN.View entering={FadeInDown.delay(300).springify()}>
                            <Text style={styles.sectionTitle}>Suggested Topics</Text>
                            <FlatList
                                horizontal
                                data={SUGGESTED_TOPICS}
                                keyExtractor={(item) => item.label}
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.topicsList}
                                renderItem={({ item }) => (
                                    <TopicChip
                                        label={item.label}
                                        icon={item.icon}
                                        selected={selectedTopic === item.label}
                                        onPress={() => setSelectedTopic(
                                            selectedTopic === item.label ? null : item.label
                                        )}
                                    />
                                )}
                            />
                        </AnimatedRN.View>

                        {/* Recent Calls Header */}
                        <AnimatedRN.View entering={FadeInDown.delay(400).springify()}>
                            <Text style={styles.sectionTitle}>Recent Calls</Text>
                        </AnimatedRN.View>
                    </>
                }
                renderItem={({ item, index }) => (
                    <AnimatedRN.View entering={FadeInRight.delay(500 + index * 100).springify()}>
                        <RecentCallCard
                            item={item}
                            onPress={() => {
                                // TODO: Navigate to CallFeedback with session ID
                            }}
                        />
                    </AnimatedRN.View>
                )}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.text.secondary} />
                        <Text style={styles.emptyText}>No calls yet</Text>
                        <Text style={styles.emptySubtext}>Start your first practice call!</Text>
                    </View>
                }
                ListFooterComponent={<View style={{ height: 120 }} />}
            />
        </SafeAreaView>
    );
}

// ─── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    scrollContent: {
        paddingBottom: theme.spacing.xl,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.l,
        paddingTop: theme.spacing.m,
        marginBottom: theme.spacing.l,
    },
    title: {
        fontSize: theme.typography.sizes.xxl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
    },
    subtitle: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
        marginTop: 2,
    },
    levelBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: theme.colors.primary + '12',
    },
    levelText: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '700',
        color: theme.colors.primary,
    },

    // Find Partner
    findPartnerContainer: {
        alignItems: 'center',
        marginBottom: theme.spacing.xl,
        paddingHorizontal: theme.spacing.l,
    },
    pulseContainer: {
        width: '100%',
        height: 80,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pulseRing: {
        position: 'absolute',
        width: SCREEN_WIDTH - theme.spacing.l * 2,
        height: 64,
        borderRadius: 32,
        borderWidth: 2,
        borderColor: theme.colors.primaryLight,
    },
    findButtonWrapper: {
        width: '100%',
        ...theme.shadows.primaryGlow,
    },
    findButton: {
        flexDirection: 'row',
        width: '100%',
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        gap: theme.spacing.m,
    },
    findButtonText: {
        color: 'white',
        fontSize: theme.typography.sizes.l,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    callHintText: {
        marginTop: 16,
        color: theme.colors.text.secondary,
        fontSize: theme.typography.sizes.s,
    },

    // Topics
    sectionTitle: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        paddingHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.m,
    },
    topicsList: {
        paddingHorizontal: theme.spacing.l,
        gap: theme.spacing.s,
        marginBottom: theme.spacing.xl,
    },
    topicChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.m,
        paddingVertical: 10,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: theme.colors.surface,
        borderWidth: 1.5,
        borderColor: theme.colors.border,
        gap: 6,
        ...theme.shadows.small,
    },
    topicChipSelected: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.primary + '10',
    },
    topicIcon: {
        fontSize: 16,
    },
    topicText: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '500',
        color: theme.colors.text.secondary,
    },
    topicTextSelected: {
        color: theme.colors.primary,
        fontWeight: '600',
    },

    // Recent Calls
    callCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.s,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.l,
        ...theme.shadows.small,
    },
    callCardAvatar: {
        marginRight: theme.spacing.m,
    },
    avatarGradient: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: 'white',
        fontSize: theme.typography.sizes.m,
        fontWeight: 'bold',
    },
    callCardInfo: {
        flex: 1,
    },
    callPartnerName: {
        fontSize: theme.typography.sizes.m,
        fontWeight: '600',
        color: theme.colors.text.primary,
    },
    callMeta: {
        fontSize: theme.typography.sizes.xs,
        color: theme.colors.text.secondary,
        marginTop: 2,
    },
    scoreBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: theme.borderRadius.circle,
    },
    scoreBadgeText: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '700',
    },

    // Empty State
    emptyState: {
        alignItems: 'center',
        paddingVertical: theme.spacing.xxl,
        gap: theme.spacing.s,
    },
    emptyText: {
        fontSize: theme.typography.sizes.l,
        fontWeight: '600',
        color: theme.colors.text.primary,
    },
    emptySubtext: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
    },
    retryTextButton: {
        marginTop: theme.spacing.m,
    },
    retryText: {
        color: theme.colors.primary,
        fontWeight: '600',
        textDecorationLine: 'underline',
    },
    cancelButton: {
        marginTop: 20,
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    cancelButtonText: {
        color: theme.colors.text.secondary,
        fontWeight: '600',
        fontSize: theme.typography.sizes.s,
    },

    // Mode Toggle
    modeToggle: {
        flexDirection: 'row',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        padding: 4,
        marginBottom: theme.spacing.xl,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    modeBtn: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: theme.borderRadius.m,
        flexDirection: 'row',
        alignItems: 'center',
    },
    modeBtnActive: {
        backgroundColor: theme.colors.primary,
    },
    modeText: {
        color: theme.colors.text.secondary,
        fontWeight: '600',
        fontSize: theme.typography.sizes.s,
    },
    modeTextActive: {
        color: 'white',
    },
    pulseContainerLocked: {
        opacity: 0.8,
    },
    searchHint: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        marginTop: 4,
    },
});
