import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { theme } from '../theme/theme';
import { userApi, AssessmentHistoryItem } from '../api/user';
import { sessionsApi } from '../api/sessions';

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

// ─── Formatting Helper ────────────────────────────────────
function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Session Card ─────────────────────────────────────────
function SessionCard({ item, index, onPress }: {
    item: AssessmentHistoryItem; index: number; onPress: () => void;
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
                        <Text style={styles.sessionMetaText}>{formatDate(item.date)}</Text>
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
    const [sessions, setSessions] = useState<AssessmentHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            const fetchHistory = async () => {
                try {
                    const data = await sessionsApi.listSessions();
                    const mappedData: AssessmentHistoryItem[] = data.map((s: any) => {
                        const analysis = s.analyses?.[0];
                        return {
                            id: s.id,
                            date: s.startedAt || s.createdAt,
                            duration: s.duration || 0,
                            overallScore: analysis?.scores?.overall || 0,
                            cefrLevel: analysis?.cefrLevel || 'B1',
                            partnerName: s.participants?.length > 1 ? 'Practice Partner' : 'AI Tutor',
                            topic: s.topic || 'General Conversation',
                            status: s.status
                        };
                    });
                    setSessions(mappedData);
                } catch (error) {
                    console.error('Failed to fetch history:', error);
                } finally {
                    setLoading(false);
                }
            };
            fetchHistory();
        }, [])
    );

    // Apply filter logic
    const filteredSessions = sessions.filter(s => {
        if (filter === 'all') return true;
        const sessionDate = new Date(s.date);
        const now = new Date();
        if (filter === 'week') {
            const oneWeekAgo = new Date(now);
            oneWeekAgo.setDate(now.getDate() - 7);
            return sessionDate >= oneWeekAgo;
        }
        if (filter === 'month') {
            const oneMonthAgo = new Date(now);
            oneMonthAgo.setMonth(now.getMonth() - 1);
            return sessionDate >= oneMonthAgo;
        }
        return true;
    });

    const averageScore = filteredSessions.length > 0
        ? Math.min(100, Math.round(filteredSessions.reduce((sum, s) => sum + Math.min(100, s.overallScore), 0) / filteredSessions.length))
        : 0;

    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={filteredSessions}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                ListHeaderComponent={
                    <>
                        {/* Header */}
                        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
                            <Text style={styles.title}>Sessions</Text>
                            {filteredSessions.length > 0 && (
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
                        {filteredSessions.length > 0 && (
                            <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.statsRow}>
                                <View style={styles.statCard}>
                                    <Text style={styles.statValue}>{filteredSessions.length}</Text>
                                    <Text style={styles.statLabel}>Total Sessions</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={styles.statValue}>
                                        {Math.round(filteredSessions.reduce((sum, s) => sum + s.duration, 0) / 60)}m
                                    </Text>
                                    <Text style={styles.statLabel}>Total Time</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Text style={[styles.statValue, { color: theme.colors.success }]}>
                                        {Math.min(100, Math.max(...filteredSessions.map(s => s.overallScore)))}
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
        backgroundColor: '#F0F2F8',
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
    statsRow: {
        flexDirection: 'row',
        paddingHorizontal: theme.spacing.l,
        gap: theme.spacing.s,
        marginBottom: theme.spacing.l,
    },
    statCard: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 16,
        padding: theme.spacing.m,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.6)',
        ...theme.shadows.medium,
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
    sessionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.s,
        padding: theme.spacing.m,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.6)',
        ...theme.shadows.medium,
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
