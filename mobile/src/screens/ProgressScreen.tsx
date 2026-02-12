import React from 'react';
import {
    View, Text, StyleSheet, ScrollView, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { theme } from '../theme/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Mock Data ─────────────────────────────────────────────
const MOCK_PROGRESS = {
    currentLevel: 'B1',
    levelLabel: 'Intermediate',
    nextLevel: 'B2',
    progressToNext: 65, // percentage
    pointsToNext: 150,
    overallScore: 78,
    streak: 12,
    streakBest: 15,
    sessionsThisWeek: 5,
    sessionGoal: 7,
    skills: {
        grammar: 72,
        pronunciation: 85,
        fluency: 68,
        vocabulary: 80,
    },
    recentScores: [
        { day: 'Mon', score: 68 },
        { day: 'Tue', score: 72 },
        { day: 'Wed', score: 70 },
        { day: 'Thu', score: 75 },
        { day: 'Fri', score: 78 },
        { day: 'Sat', score: 82 },
        { day: 'Sun', score: 81 },
    ],
    commonMistakes: [
        { type: 'Prepositions (at/in/on)', count: 45, icon: 'swap-horizontal' },
        { type: 'Verb Tenses (Past Simple)', count: 30, icon: 'time' },
        { type: 'Articles (a/an/the)', count: 20, icon: 'text' },
    ],
};

// ─── Circular Progress ────────────────────────────────────
function CircularSkill({ label, score, color, subtitle, delay }: {
    label: string; score: number; color: string; subtitle: string; delay: number;
}) {
    const size = (SCREEN_WIDTH - theme.spacing.l * 2 - theme.spacing.m * 3) / 4;
    const strokeWidth = 4;
    const radius = (size - strokeWidth * 2) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference;

    return (
        <Animated.View entering={FadeInDown.delay(delay).springify()} style={[styles.skillCircle, { width: size }]}>
            <View style={[styles.circularContainer, { width: size, height: size }]}>
                {/* Background ring */}
                <View style={[styles.circleTrack, {
                    width: size, height: size, borderRadius: size / 2,
                    borderWidth: strokeWidth, borderColor: color + '20',
                }]} />
                {/* Score */}
                <Text style={[styles.circleScore, { color }]}>{score}%</Text>
            </View>
            <Text style={styles.circleLabel}>{label}</Text>
            <Text style={styles.circleSubtitle} numberOfLines={1}>{subtitle}</Text>
        </Animated.View>
    );
}

// ─── Mini Bar Chart ───────────────────────────────────────
function MiniChart({ data }: { data: typeof MOCK_PROGRESS.recentScores }) {
    const max = Math.max(...data.map(d => d.score));
    const min = Math.min(...data.map(d => d.score));
    const range = max - min || 1;
    const barWidth = (SCREEN_WIDTH - theme.spacing.l * 2 - theme.spacing.m * 2 - data.length * 4) / data.length;

    return (
        <View style={styles.chartContainer}>
            <View style={styles.chartBars}>
                {data.map((item, index) => {
                    const height = ((item.score - min + 10) / (range + 20)) * 80 + 20;
                    const isLast = index === data.length - 1;
                    return (
                        <Animated.View
                            key={item.day}
                            entering={FadeInDown.delay(500 + index * 50).springify()}
                            style={styles.chartBarWrapper}
                        >
                            <Text style={[styles.chartValue, isLast && { color: theme.colors.primary, fontWeight: '700' }]}>
                                {item.score}
                            </Text>
                            <View style={[
                                styles.chartBar,
                                {
                                    height,
                                    backgroundColor: isLast ? theme.colors.primary : theme.colors.primary + '30',
                                    width: barWidth,
                                },
                            ]} />
                            <Text style={styles.chartDay}>{item.day}</Text>
                        </Animated.View>
                    );
                })}
            </View>
        </View>
    );
}

// ─── Main Component ───────────────────────────────────────
export default function ProgressScreen() {
    const data = MOCK_PROGRESS;

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {/* Header */}
                <Animated.View entering={FadeInDown.delay(100).springify()}>
                    <Text style={styles.title}>Your Progress</Text>
                </Animated.View>

                {/* CEFR Level Card */}
                <Animated.View entering={FadeInDown.delay(150).springify()} style={styles.levelCard}>
                    <LinearGradient
                        colors={theme.colors.gradients.primary}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.levelGradient}
                    >
                        <View style={styles.levelTop}>
                            <View>
                                <Text style={styles.levelSmallLabel}>CEFR Level</Text>
                                <Text style={styles.levelBig}>{data.currentLevel}</Text>
                                <Text style={styles.levelName}>{data.levelLabel}</Text>
                            </View>
                            <View style={styles.levelProgress}>
                                <View style={styles.levelProgressTrack}>
                                    <View style={[styles.levelProgressFill, { width: `${data.progressToNext}%` }]} />
                                </View>
                                <View style={styles.levelProgressLabels}>
                                    <Text style={styles.levelProgressText}>{data.currentLevel}</Text>
                                    <Text style={styles.levelProgressText}>{data.nextLevel}</Text>
                                </View>
                                <Text style={styles.levelPointsText}>
                                    {data.pointsToNext} points to {data.nextLevel}
                                </Text>
                            </View>
                        </View>
                    </LinearGradient>
                </Animated.View>

                {/* Score Trend */}
                <Animated.View entering={FadeInDown.delay(300).springify()}>
                    <Text style={styles.sectionTitle}>Score Trend</Text>
                    <View style={styles.trendCard}>
                        <MiniChart data={data.recentScores} />
                    </View>
                </Animated.View>

                {/* Skill Breakdown */}
                <Animated.View entering={FadeInDown.delay(400).springify()}>
                    <Text style={styles.sectionTitle}>Skill Breakdown</Text>
                </Animated.View>
                <View style={styles.skillsRow}>
                    <CircularSkill label="Grammar" score={data.skills.grammar} color="#6366F1" subtitle="Verb forms" delay={500} />
                    <CircularSkill label="Pronun." score={data.skills.pronunciation} color="#10B981" subtitle="Intonation" delay={600} />
                    <CircularSkill label="Fluency" score={data.skills.fluency} color="#F59E0B" subtitle="Hesitation" delay={700} />
                    <CircularSkill label="Vocab" score={data.skills.vocabulary} color="#8B5CF6" subtitle="A-Z variety" delay={800} />
                </View>

                {/* Streak + Sessions */}
                <Animated.View entering={FadeInDown.delay(900).springify()} style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <View style={styles.statIconRow}>
                            <Text style={styles.fireEmoji}>🔥</Text>
                        </View>
                        <Text style={styles.statBigValue}>{data.streak}</Text>
                        <Text style={styles.statUnit}>days</Text>
                        <Text style={styles.statSubtext}>Best: {data.streakBest} days</Text>
                    </View>

                    <View style={styles.statCard}>
                        <View style={styles.statIconRow}>
                            <Ionicons name="calendar" size={20} color={theme.colors.primary} />
                        </View>
                        <View style={styles.sessionCountRow}>
                            <Text style={styles.statBigValue}>{data.sessionsThisWeek}</Text>
                            <Text style={styles.sessionGoal}>/{data.sessionGoal}</Text>
                        </View>
                        <Text style={styles.statUnit}>this week</Text>
                        <Text style={styles.statSubtext}>
                            {data.sessionGoal - data.sessionsThisWeek} more to go!
                        </Text>
                    </View>
                </Animated.View>

                {/* Common Mistakes */}
                <Animated.View entering={FadeInDown.delay(1000).springify()}>
                    <Text style={styles.sectionTitle}>Common Mistakes</Text>
                    <View style={styles.mistakesCard}>
                        {data.commonMistakes.map((item, index) => (
                            <View key={item.type} style={[
                                styles.mistakeRow,
                                index < data.commonMistakes.length - 1 && styles.mistakeRowBorder,
                            ]}>
                                <View style={styles.mistakeIcon}>
                                    <Ionicons name={item.icon as any} size={16} color={theme.colors.primary} />
                                </View>
                                <Text style={styles.mistakeType} numberOfLines={1}>{item.type}</Text>
                                <View style={styles.mistakeCountBadge}>
                                    <Text style={styles.mistakeCount}>{item.count}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </Animated.View>

                <View style={{ height: 120 }} />
            </ScrollView>
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
    title: {
        fontSize: theme.typography.sizes.xxl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        paddingHorizontal: theme.spacing.l,
        paddingTop: theme.spacing.m,
        marginBottom: theme.spacing.l,
    },

    // Level Card
    levelCard: {
        marginHorizontal: theme.spacing.l,
        borderRadius: theme.borderRadius.xl,
        marginBottom: theme.spacing.l,
        ...theme.shadows.medium,
    },
    levelGradient: {
        borderRadius: theme.borderRadius.xl,
        padding: theme.spacing.l,
    },
    levelTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.l,
    },
    levelSmallLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: theme.typography.sizes.xs,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    levelBig: {
        color: 'white',
        fontSize: 48,
        fontWeight: 'bold',
        lineHeight: 56,
    },
    levelName: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: theme.typography.sizes.s,
    },
    levelProgress: {
        flex: 1,
    },
    levelProgressTrack: {
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.2)',
        overflow: 'hidden',
    },
    levelProgressFill: {
        height: '100%',
        borderRadius: 4,
        backgroundColor: 'white',
    },
    levelProgressLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    levelProgressText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 11,
        fontWeight: '600',
    },
    levelPointsText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        marginTop: 4,
    },

    // Section
    sectionTitle: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        paddingHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.m,
        marginTop: theme.spacing.s,
    },

    // Trend
    trendCard: {
        backgroundColor: theme.colors.surface,
        marginHorizontal: theme.spacing.l,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.m,
        marginBottom: theme.spacing.m,
        ...theme.shadows.small,
    },
    chartContainer: {
        paddingVertical: theme.spacing.s,
    },
    chartBars: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height: 120,
    },
    chartBarWrapper: {
        alignItems: 'center',
        flex: 1,
    },
    chartValue: {
        fontSize: 10,
        color: theme.colors.text.secondary,
        marginBottom: 4,
    },
    chartBar: {
        borderRadius: 4,
        minHeight: 8,
    },
    chartDay: {
        fontSize: 10,
        color: theme.colors.text.secondary,
        marginTop: 6,
        fontWeight: '500',
    },

    // Skills
    skillsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.m,
    },
    skillCircle: {
        alignItems: 'center',
    },
    circularContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 6,
    },
    circleTrack: {
        position: 'absolute',
    },
    circleScore: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '700',
    },
    circleLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: theme.colors.text.primary,
        textAlign: 'center',
    },
    circleSubtitle: {
        fontSize: 9,
        color: theme.colors.text.secondary,
        textAlign: 'center',
    },

    // Stats
    statsRow: {
        flexDirection: 'row',
        paddingHorizontal: theme.spacing.l,
        gap: theme.spacing.m,
        marginBottom: theme.spacing.m,
    },
    statCard: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.m,
        alignItems: 'center',
        ...theme.shadows.small,
    },
    statIconRow: {
        marginBottom: theme.spacing.s,
    },
    fireEmoji: {
        fontSize: 24,
    },
    statBigValue: {
        fontSize: 36,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
    },
    statUnit: {
        fontSize: theme.typography.sizes.xs,
        color: theme.colors.text.secondary,
        fontWeight: '500',
    },
    statSubtext: {
        fontSize: 11,
        color: theme.colors.text.secondary,
        marginTop: 4,
    },
    sessionCountRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    sessionGoal: {
        fontSize: theme.typography.sizes.l,
        color: theme.colors.text.secondary,
        fontWeight: '500',
    },

    // Common Mistakes
    mistakesCard: {
        backgroundColor: theme.colors.surface,
        marginHorizontal: theme.spacing.l,
        borderRadius: theme.borderRadius.l,
        overflow: 'hidden',
        ...theme.shadows.small,
    },
    mistakeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: theme.spacing.m,
        gap: theme.spacing.m,
    },
    mistakeRowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    mistakeIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: theme.colors.primary + '12',
        justifyContent: 'center',
        alignItems: 'center',
    },
    mistakeType: {
        flex: 1,
        fontSize: theme.typography.sizes.s,
        fontWeight: '500',
        color: theme.colors.text.primary,
    },
    mistakeCountBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: theme.colors.primary + '12',
    },
    mistakeCount: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '700',
        color: theme.colors.primary,
    },
});
