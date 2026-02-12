import React, { useState } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme/theme';

// ─── Mock Data ─────────────────────────────────────────────
const MOCK_SESSIONS = [
    {
        id: '1',
        topic: 'Travel Plans',
        partnerName: 'Sarah M.',
        date: 'Today, 2:30 PM',
        duration: 720,
        overallScore: 82,
        cefrLevel: 'B1',
        status: 'COMPLETED',
    },
    {
        id: '2',
        topic: 'Daily Routine',
        partnerName: 'David L.',
        date: 'Yesterday, 5:15 PM',
        duration: 480,
        overallScore: 75,
        cefrLevel: 'B1',
        status: 'COMPLETED',
    },
    {
        id: '3',
        topic: 'Movies & TV',
        partnerName: 'Priya K.',
        date: 'Feb 10, 11:00 AM',
        duration: 600,
        overallScore: 88,
        cefrLevel: 'B1',
        status: 'COMPLETED',
    },
    {
        id: '4',
        topic: 'Technology',
        partnerName: 'Raj P.',
        date: 'Feb 9, 3:45 PM',
        duration: 540,
        overallScore: 70,
        cefrLevel: 'A2',
        status: 'COMPLETED',
    },
    {
        id: '5',
        topic: 'Food & Cooking',
        partnerName: 'Ananya S.',
        date: 'Feb 8, 6:20 PM',
        duration: 660,
        overallScore: 85,
        cefrLevel: 'B1',
        status: 'COMPLETED',
    },
];

type FilterType = 'all' | 'week' | 'month';

// ─── Filter Chip ──────────────────────────────────────────
function FilterChip({ label, active, onPress }: {
    label: string; active: boolean; onPress: () => void;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            style={[styles.filterChip, active && styles.filterChipActive]}
        >
            <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
        </TouchableOpacity>
    );
}

// ─── Session Card ─────────────────────────────────────────
function SessionCard({ item, index, onPress }: {
    item: typeof MOCK_SESSIONS[0]; index: number; onPress: () => void;
}) {
    const minutes = Math.floor(item.duration / 60);
    const scoreColor = item.overallScore >= 80
        ? theme.colors.success
        : item.overallScore >= 60
            ? theme.colors.warning
            : theme.colors.error;

    return (
        <Animated.View entering={FadeInRight.delay(200 + index * 80).springify()}>
            <TouchableOpacity style={styles.sessionCard} activeOpacity={0.7} onPress={onPress}>
                <View style={styles.sessionLeft}>
                    <LinearGradient
                        colors={theme.colors.gradients.primary}
                        style={styles.sessionAvatar}
                    >
                        <Text style={styles.sessionAvatarText}>
                            {item.partnerName.charAt(0)}
                        </Text>
                    </LinearGradient>
                </View>
                <View style={styles.sessionCenter}>
                    <Text style={styles.sessionTopic}>{item.topic}</Text>
                    <Text style={styles.sessionPartner}>{item.partnerName}</Text>
                    <View style={styles.sessionMeta}>
                        <Ionicons name="time-outline" size={12} color={theme.colors.text.secondary} />
                        <Text style={styles.sessionMetaText}>{minutes} min</Text>
                        <Text style={styles.sessionDot}>·</Text>
                        <Text style={styles.sessionMetaText}>{item.date}</Text>
                    </View>
                </View>
                <View style={styles.sessionRight}>
                    <View style={[styles.sessionScoreBadge, { backgroundColor: scoreColor + '15' }]}>
                        <Text style={[styles.sessionScoreText, { color: scoreColor }]}>{item.overallScore}</Text>
                    </View>
                    <Text style={styles.sessionLevel}>{item.cefrLevel}</Text>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─── Empty State ──────────────────────────────────────────
function EmptyState({ navigation }: { navigation: any }) {
    return (
        <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
                <Ionicons name="chatbubbles-outline" size={64} color={theme.colors.primaryLight + '40'} />
            </View>
            <Text style={styles.emptyTitle}>No sessions yet</Text>
            <Text style={styles.emptySubtitle}>
                Start a practice call to see your feedback here
            </Text>
            <TouchableOpacity
                style={styles.emptyButton}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('Call')}
            >
                <LinearGradient
                    colors={theme.colors.gradients.primary}
                    style={styles.emptyButtonGradient}
                >
                    <Ionicons name="call" size={18} color="white" />
                    <Text style={styles.emptyButtonText}>Start a Call</Text>
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );
}

// ─── Main Component ───────────────────────────────────────
export default function FeedbackScreen() {
    const navigation: any = useNavigation();
    const [filter, setFilter] = useState<FilterType>('all');

    // In a real app, filter would query the API
    const sessions = MOCK_SESSIONS;

    const averageScore = sessions.length > 0
        ? Math.round(sessions.reduce((sum, s) => sum + s.overallScore, 0) / sessions.length)
        : 0;

    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={sessions}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                ListHeaderComponent={
                    <>
                        {/* Header */}
                        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
                            <Text style={styles.title}>Sessions</Text>
                            {sessions.length > 0 && (
                                <View style={styles.avgBadge}>
                                    <Ionicons name="analytics" size={14} color={theme.colors.primary} />
                                    <Text style={styles.avgText}>Avg: {averageScore}</Text>
                                </View>
                            )}
                        </Animated.View>

                        {/* Filters */}
                        <Animated.View entering={FadeInDown.delay(150).springify()} style={styles.filters}>
                            <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
                            <FilterChip label="This Week" active={filter === 'week'} onPress={() => setFilter('week')} />
                            <FilterChip label="This Month" active={filter === 'month'} onPress={() => setFilter('month')} />
                        </Animated.View>

                        {/* Stats Summary */}
                        {sessions.length > 0 && (
                            <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.statsRow}>
                                <View style={styles.statCard}>
                                    <Text style={styles.statValue}>{sessions.length}</Text>
                                    <Text style={styles.statLabel}>Total Sessions</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={styles.statValue}>
                                        {Math.round(sessions.reduce((sum, s) => sum + s.duration, 0) / 60)}m
                                    </Text>
                                    <Text style={styles.statLabel}>Total Time</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={[styles.statValue, { color: theme.colors.success }]}>
                                        {Math.max(...sessions.map(s => s.overallScore))}
                                    </Text>
                                    <Text style={styles.statLabel}>Best Score</Text>
                                </View>
                            </Animated.View>
                        )}
                    </>
                }
                renderItem={({ item, index }) => (
                    <SessionCard
                        item={item}
                        index={index}
                        onPress={() => navigation.navigate('CallFeedback', {
                            sessionId: item.id,
                            partnerName: item.partnerName,
                            topic: item.topic,
                        })}
                    />
                )}
                ListEmptyComponent={<EmptyState navigation={navigation} />}
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

    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.l,
        paddingTop: theme.spacing.m,
        marginBottom: theme.spacing.m,
    },
    title: {
        fontSize: theme.typography.sizes.xxl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
    },
    avgBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: theme.colors.primary + '12',
    },
    avgText: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '700',
        color: theme.colors.primary,
    },

    // Filters
    filters: {
        flexDirection: 'row',
        paddingHorizontal: theme.spacing.l,
        gap: theme.spacing.s,
        marginBottom: theme.spacing.l,
    },
    filterChip: {
        paddingHorizontal: theme.spacing.m,
        paddingVertical: 8,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    filterChipActive: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    filterText: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '500',
        color: theme.colors.text.secondary,
    },
    filterTextActive: {
        color: 'white',
        fontWeight: '600',
    },

    // Stats
    statsRow: {
        flexDirection: 'row',
        paddingHorizontal: theme.spacing.l,
        gap: theme.spacing.s,
        marginBottom: theme.spacing.l,
    },
    statCard: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        alignItems: 'center',
        ...theme.shadows.small,
    },
    statValue: {
        fontSize: theme.typography.sizes.xl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
    },
    statLabel: {
        fontSize: 11,
        color: theme.colors.text.secondary,
        marginTop: 2,
    },

    // Session Card
    sessionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.s,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.l,
        ...theme.shadows.small,
    },
    sessionLeft: {
        marginRight: theme.spacing.m,
    },
    sessionAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sessionAvatarText: {
        color: 'white',
        fontSize: theme.typography.sizes.m,
        fontWeight: 'bold',
    },
    sessionCenter: {
        flex: 1,
    },
    sessionTopic: {
        fontSize: theme.typography.sizes.m,
        fontWeight: '600',
        color: theme.colors.text.primary,
    },
    sessionPartner: {
        fontSize: theme.typography.sizes.xs,
        color: theme.colors.text.secondary,
        marginTop: 1,
    },
    sessionMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    sessionMetaText: {
        fontSize: 11,
        color: theme.colors.text.secondary,
    },
    sessionDot: {
        color: theme.colors.text.secondary,
        fontSize: 11,
    },
    sessionRight: {
        alignItems: 'center',
        gap: 4,
    },
    sessionScoreBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: theme.borderRadius.circle,
    },
    sessionScoreText: {
        fontSize: theme.typography.sizes.m,
        fontWeight: '700',
    },
    sessionLevel: {
        fontSize: 10,
        color: theme.colors.text.secondary,
        fontWeight: '500',
    },

    // Empty State
    emptyState: {
        alignItems: 'center',
        paddingVertical: theme.spacing.xxl * 2,
        paddingHorizontal: theme.spacing.l,
    },
    emptyIconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: theme.colors.primary + '08',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: theme.spacing.l,
    },
    emptyTitle: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.s,
    },
    emptySubtitle: {
        fontSize: theme.typography.sizes.m,
        color: theme.colors.text.secondary,
        textAlign: 'center',
        marginBottom: theme.spacing.xl,
    },
    emptyButton: {
        borderRadius: theme.borderRadius.l,
        overflow: 'hidden',
        ...theme.shadows.primaryGlow,
    },
    emptyButtonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.m,
        gap: theme.spacing.s,
    },
    emptyButtonText: {
        color: 'white',
        fontSize: theme.typography.sizes.m,
        fontWeight: 'bold',
    },
});
