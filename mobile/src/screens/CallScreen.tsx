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
import { theme } from '../theme/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
                            toValue: 1.8,
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
                { transform: [{ scale }], opacity },
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

    const meta = (user?.unsafeMetadata || {}) as any;
    const userLevel = meta.assessmentLevel || 'B1';

    const handleFindPartner = () => {
        setIsSearching(true);
        // Simulate matching — in real app this would hit matchmaking API
        setTimeout(() => {
            setIsSearching(false);
            // TODO: Navigate to InCallScreen when matchmaking is live
        }, 3000);
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

                        {/* Find Partner Button */}
                        <AnimatedRN.View entering={FadeInDown.delay(200).springify()} style={styles.findPartnerContainer}>
                            <View style={styles.pulseContainer}>
                                <PulseRing delay={0} />
                                <PulseRing delay={700} />
                                <PulseRing delay={1400} />
                                <TouchableOpacity
                                    activeOpacity={0.85}
                                    onPress={handleFindPartner}
                                    disabled={isSearching}
                                >
                                    <LinearGradient
                                        colors={isSearching
                                            ? [theme.colors.primaryLight, theme.colors.primary]
                                            : theme.colors.gradients.primary
                                        }
                                        style={styles.findButton}
                                    >
                                        {isSearching ? (
                                            <>
                                                <Ionicons name="search" size={36} color="white" />
                                                <Text style={styles.findButtonText}>Searching...</Text>
                                            </>
                                        ) : (
                                            <>
                                                <Ionicons name="call" size={36} color="white" />
                                                <Text style={styles.findButtonText}>Find a Partner</Text>
                                            </>
                                        )}
                                    </LinearGradient>
                                </TouchableOpacity>
                            </View>
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
    },
    pulseContainer: {
        width: 180,
        height: 180,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pulseRing: {
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: 70,
        borderWidth: 2,
        borderColor: theme.colors.primaryLight,
    },
    findButton: {
        width: 140,
        height: 140,
        borderRadius: 70,
        justifyContent: 'center',
        alignItems: 'center',
        gap: theme.spacing.s,
        ...theme.shadows.primaryGlow,
    },
    findButtonText: {
        color: 'white',
        fontSize: theme.typography.sizes.s,
        fontWeight: '700',
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
});
