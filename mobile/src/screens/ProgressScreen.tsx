import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, StatusBar, Dimensions,
    TouchableOpacity, LayoutAnimation, Animated as RNAnimated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Polygon, Line, Text as SvgText, Polyline, Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { useUser } from '@clerk/clerk-expo';

import { sessionsApi, ConversationSession } from '../api/sessions';
import { userApi, UserStats } from '../api/user';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;

// ─── Colors ───────────────────────────────────────────────
const C = {
    bg: '#FFFAFA',          // snow white
    cardBg: 'rgba(15,23,42,0.06)',
    cardBorder: 'rgba(15,23,42,0.08)',
    gold: '#f59e0b',
    goldLight: 'rgba(245,158,11,0.12)',
    green: '#10b981',
    red: '#ef4444',
    purple: '#8b5cf6',
    blue: '#3b82f6',
    textPrimary: '#0f172a',
    textSecondary: '#64748b',
    textMuted: '#94a3b8',
};

const categoryColors: Record<string, string> = {
    Grammar: C.purple,
    Pronunciation: C.blue,
    Fluency: C.gold,
    Vocabulary: C.green,
};

// ─── Animated Ring Component ──────────────────────────────
function ScoreRing({ score, size, strokeWidth, color, label }: {
    score: number; size: number; strokeWidth: number; color: string; label: string;
}) {
    const animVal = useRef(new RNAnimated.Value(0)).current;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    useEffect(() => {
        RNAnimated.timing(animVal, {
            toValue: score,
            duration: 1200,
            useNativeDriver: false,
        }).start();
    }, [score]);

    const strokeDash = animVal.interpolate({
        inputRange: [0, 100],
        outputRange: [0, circumference],
    });

    return (
        <View style={{ alignItems: 'center', width: size + 4 }}>
            <View style={{ width: size, height: size }}>
                <Svg width={size} height={size}>
                    <Circle
                        cx={size / 2} cy={size / 2} r={radius}
                        stroke="rgba(0,0,0,0.06)" strokeWidth={strokeWidth} fill="none"
                    />
                </Svg>
                <RNAnimated.View style={{ position: 'absolute', top: 0, left: 0 }}>
                    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
                        <AnimatedCircle
                            cx={size / 2} cy={size / 2} r={radius}
                            stroke={color}
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={RNAnimated.subtract(circumference, strokeDash)}
                        />
                    </Svg>
                </RNAnimated.View>
                <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: size * 0.28, fontWeight: '800', color: C.textPrimary }}>{score}</Text>
                </View>
            </View>
            <Text style={{ fontSize: 10, color: C.textSecondary, marginTop: 3, fontWeight: '600' }}>{label}</Text>
        </View>
    );
}

const AnimatedCircle = RNAnimated.createAnimatedComponent(Circle);

// ─── Skeleton Placeholder ─────────────────────────────────
function Skeleton({ width, height, style }: { width: number | string; height: number; style?: any }) {
    return <View style={[{ width, height, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.06)' }, style]} />;
}

// ─── Expandable Mistake Card ──────────────────────────────
function MistakeCard({ mistake }: { mistake: any }) {
    const [expanded, setExpanded] = useState(false);

    const toggleExpanded = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(!expanded);
    };

    const getTrendInfo = (trend: string) => {
        switch (trend) {
            case 'improving': return { icon: '📈', label: 'Getting better', color: C.green };
            case 'resolved': return { icon: '✅', label: 'Resolved!', color: C.green };
            default: return { icon: '⚠️', label: 'Still happening', color: C.gold };
        }
    };

    const trendInfo = getTrendInfo(mistake.trend);
    const catColor = categoryColors[mistake.category] || C.textSecondary;

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={toggleExpanded}
            style={styles.mistakeCard}
        >
            <View style={styles.mistakeTop}>
                <View style={{ flex: 1 }}>
                    <View style={[styles.catBadge, { backgroundColor: catColor + '18' }]}>
                        <Text style={[styles.catBadgeText, { color: catColor }]}>{mistake.category}</Text>
                    </View>
                    <Text style={styles.mistakePattern}>{mistake.pattern}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <Text style={{ fontSize: 13 }}>{trendInfo.icon}</Text>
                        <Text style={[styles.trendLabel, { color: trendInfo.color }]}>{trendInfo.label}</Text>
                        <Text style={styles.sessionCount}>· {mistake.sessions_with_issue} sessions</Text>
                    </View>
                </View>
                <View style={[styles.occCount, { backgroundColor: trendInfo.color + '15' }]}>
                    <Text style={[styles.occNumber, { color: trendInfo.color }]}>{mistake.occurrences}</Text>
                    <Text style={styles.occLabel}>times</Text>
                </View>
            </View>

            {expanded && (
                <View style={styles.mistakeDetail}>
                    <View style={styles.exampleRow}>
                        <Text style={styles.exWrong}>❌  You said:</Text>
                        <Text style={styles.exWrongText}>"{mistake.example_wrong}"</Text>
                    </View>
                    <Text style={{ textAlign: 'center', color: C.textMuted, fontSize: 18, marginVertical: 4 }}>↓</Text>
                    <View style={styles.exampleRow}>
                        <Text style={styles.exRight}>✓  Should be:</Text>
                        <Text style={styles.exRightText}>"{mistake.example_right}"</Text>
                    </View>
                </View>
            )}
        </TouchableOpacity>
    );
}

// ═══════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════
export default function ProgressScreen() {
    const { user } = useUser();
    const [stats, setStats] = useState<UserStats | null>(null);
    const [sessions, setSessions] = useState<ConversationSession[]>([]);
    const [loading, setLoading] = useState(true);

    // ─── Data fetch ──────────────────────────────────────
    useFocusEffect(
        useCallback(() => {
            const fetchData = async () => {
                setLoading(true);
                try {
                    const [statsData, sessionsData] = await Promise.all([
                        userApi.getStats(),
                        sessionsApi.listSessions(),
                    ]);
                    setStats(statsData);
                    setSessions(sessionsData);
                } catch (error) {
                    console.error('Failed to fetch progress data:', error);
                } finally {
                    setLoading(false);
                }
            };
            fetchData();
        }, [])
    );

    // ─── Derived data ────────────────────────────────────
    // IMPORTANT: Use stats from userApi.getStats() as the primary score source
    // (same fields the HomeScreen uses) to ensure uniform metrics app-wide.
    // Session analyses are only used for trend chart, previous-session comparison, and mistakes.

    const validSessions = sessions.filter(
        s => s.analyses && s.analyses.length > 0 && s.analyses[0].scores
    );

    // Current scores — sourced from UserStats (same as HomeScreen)
    const currentScores = {
        grammar: Math.min(100, stats?.grammarScore ?? 0),
        vocabulary: Math.min(100, stats?.vocabScore ?? 0),
        fluency: Math.min(100, stats?.fluencyScore ?? 0),
        pronunciation: Math.min(100, stats?.pronunciationScore ?? 0),
        overall: stats?.feedbackScore ? Math.min(100, Math.round(stats.feedbackScore)) : 0,
    };

    // Previous scores — from the second most recent valid session (for delta comparison)
    const previousSession = validSessions.length >= 2 ? validSessions[1] : null;
    const previousScores = previousSession ? {
        grammar: previousSession.analyses![0].scores.grammar || 0,
        vocabulary: previousSession.analyses![0].scores.vocabulary || 0,
        fluency: previousSession.analyses![0].scores.fluency || 0,
        pronunciation: previousSession.analyses![0].scores.pronunciation || 0,
        overall: previousSession.analyses![0].scores.overall || 0,
    } : null;

    // Trend data (last 7 overall scores, chronological — oldest to newest)
    const trendSessions = validSessions.slice(0, 7).reverse();
    const trendData = trendSessions.map(s => s.analyses![0].scores.overall);
    const trendLabels = trendSessions.map(s => {
        const d = new Date(s.startedAt);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    // Improvements (current scores vs first session scores / "since you started")
    const firstSession = validSessions.length > 0 ? validSessions[validSessions.length - 1] : null;
    const firstScores = firstSession ? firstSession.analyses![0].scores : null;
    const improvements = [
        { skill: 'Pronunciation', delta: firstScores ? currentScores.pronunciation - (firstScores.pronunciation || 0) : 0, icon: '🗣️' },
        { skill: 'Vocabulary', delta: firstScores ? currentScores.vocabulary - (firstScores.vocabulary || 0) : 0, icon: '📖' },
        { skill: 'Grammar', delta: firstScores ? currentScores.grammar - (firstScores.grammar || 0) : 0, icon: '✏️' },
        { skill: 'Fluency', delta: firstScores ? currentScores.fluency - (firstScores.fluency || 0) : 0, icon: '💨' },
    ];

    const overallDelta = previousScores ? currentScores.overall - previousScores.overall : 0;

    // Top mistakes (aggregated from session analyses)
    const mistakeMap = new Map<string, any>();
    validSessions.forEach(s => {
        const mistakes = s.analyses?.[0]?.mistakes || [];
        mistakes.forEach(m => {
            const key = m.type || m.rule || 'Unknown';
            if (mistakeMap.has(key)) {
                const existing = mistakeMap.get(key);
                existing.occurrences += 1;
                existing.sessions_with_issue += 1;
            } else {
                mistakeMap.set(key, {
                    id: mistakeMap.size + 1,
                    category: m.type?.includes('Grammar') || m.rule ? 'Grammar'
                        : m.type?.includes('Pronun') ? 'Pronunciation'
                            : m.type?.includes('Fluency') ? 'Fluency' : 'Vocabulary',
                    pattern: key,
                    occurrences: 1,
                    example_wrong: m.original || '',
                    example_right: m.corrected || '',
                    sessions_with_issue: 1,
                    trend: 'persisting' as const,
                });
            }
        });
    });
    const topMistakes = Array.from(mistakeMap.values())
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 5);

    // Milestones (derived from stats)
    const totalSessions = stats?.totalSessions || sessions.length;
    const milestones = [
        { id: 1, icon: '🎯', title: 'First Session', date: 'Completed', unlocked: totalSessions >= 1 },
        { id: 2, icon: '🔥', title: '7-Day Streak', date: `${stats?.streak || 0}/7 days`, unlocked: (stats?.streak || 0) >= 7 },
        { id: 3, icon: '🏆', title: '10 Sessions', date: `${totalSessions}/10 done`, unlocked: totalSessions >= 10 },
        { id: 4, icon: '⭐', title: 'Score 80+', date: currentScores.overall >= 80 ? 'Achieved!' : `Current: ${currentScores.overall}`, unlocked: currentScores.overall >= 80 },
        { id: 5, icon: '📚', title: '25 Sessions', date: `${totalSessions}/25 done`, unlocked: totalSessions >= 25 },
        { id: 6, icon: '💎', title: 'B2 Level', date: stats?.level === 'B2' || stats?.level === 'C1' ? 'Achieved!' : `Now: ${stats?.level || 'A1'}`, unlocked: stats?.level === 'B2' || stats?.level === 'C1' || stats?.level === 'C2' },
    ];

    // Weakest skill
    const skillEntries = [
        { skill: 'Grammar', score: currentScores.grammar },
        { skill: 'Vocabulary', score: currentScores.vocabulary },
        { skill: 'Fluency', score: currentScores.fluency },
        { skill: 'Pronunciation', score: currentScores.pronunciation },
    ];
    const weakest = skillEntries.reduce((min, e) => e.score < min.score ? e : min, skillEntries[0]);

    const hasData = validSessions.length > 0;

    // ─── Loading State ───────────────────────────────────
    if (loading) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="dark-content" />
                <SafeAreaView style={styles.safeArea}>
                    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                        <View style={styles.header}>
                            <Skeleton width={160} height={28} />
                            <Skeleton width={80} height={30} style={{ borderRadius: 20 }} />
                        </View>
                        <Skeleton width={CARD_WIDTH} height={140} style={{ alignSelf: 'center', marginBottom: 20 }} />
                        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 20 }}>
                            {[1, 2, 3, 4].map(i => <Skeleton key={i} width={100} height={100} />)}
                        </View>
                        <Skeleton width={CARD_WIDTH} height={200} style={{ alignSelf: 'center', marginBottom: 20 }} />
                        <Skeleton width={CARD_WIDTH} height={300} style={{ alignSelf: 'center', marginBottom: 20 }} />
                    </ScrollView>
                </SafeAreaView>
            </View>
        );
    }

    // ─── No Data State ───────────────────────────────────
    if (!hasData) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="dark-content" />
                <SafeAreaView style={styles.safeArea}>
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
                        <Text style={{ fontSize: 48, marginBottom: 16 }}>📊</Text>
                        <Text style={{ fontSize: 22, fontWeight: '700', color: C.textPrimary, textAlign: 'center' }}>
                            Your Learning Journal
                        </Text>
                        <Text style={{ fontSize: 15, color: C.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 22 }}>
                            Complete a session to see your progress data here. Start a conversation with a partner or practice with Priya!
                        </Text>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    // ═════════════════════════════════════════════════════
    // RENDER
    // ═════════════════════════════════════════════════════
    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* ─── 1. HEADER ──────────────────────────── */}
                    <Animated.View entering={FadeInDown.delay(50).springify()} style={styles.header}>
                        <View>
                            <Text style={styles.headerTitle}>Your Progress</Text>
                            <Text style={styles.headerSubtitle}>
                                {totalSessions} session{totalSessions !== 1 ? 's' : ''} · {stats?.streak || 0} day 🔥
                            </Text>
                        </View>
                        <View style={styles.cefrBadge}>
                            <Text style={styles.cefrLevel}>{stats?.level || 'A1'}</Text>
                            <Text style={styles.cefrLabel}>
                                {getLevelLabel(stats?.level || 'A1')}
                            </Text>
                        </View>
                    </Animated.View>

                    {/* ─── 2. OVERALL SCORE HERO ──────────────── */}
                    <Animated.View entering={FadeInDown.delay(100).springify()}>
                        <LinearGradient
                            colors={['rgba(245,158,11,0.10)', 'rgba(245,158,11,0.04)']}
                            style={styles.heroCard}
                        >
                            <View style={styles.heroLeft}>
                                <Text style={styles.heroLabel}>Overall Score</Text>
                                <Text style={styles.heroScore}>{currentScores.overall}</Text>
                                {overallDelta !== 0 && (
                                    <Text style={[styles.heroDelta, { color: overallDelta > 0 ? C.green : C.red }]}>
                                        {overallDelta > 0 ? '↑' : '↓'}{Math.abs(overallDelta)} since last
                                    </Text>
                                )}
                            </View>
                            <View style={styles.heroRings}>
                                <View style={styles.ringRow}>
                                    <ScoreRing score={currentScores.grammar} size={56} strokeWidth={5} color={C.purple} label="Grammar" />
                                    <ScoreRing score={currentScores.vocabulary} size={56} strokeWidth={5} color={C.green} label="Vocab" />
                                </View>
                                <View style={styles.ringRow}>
                                    <ScoreRing score={currentScores.fluency} size={56} strokeWidth={5} color={C.gold} label="Fluency" />
                                    <ScoreRing score={currentScores.pronunciation} size={56} strokeWidth={5} color={C.blue} label="Pronun." />
                                </View>
                            </View>
                        </LinearGradient>
                    </Animated.View>

                    {/* ─── 3. SINCE YOU STARTED ───────────────── */}
                    <Animated.View entering={FadeInDown.delay(150).springify()}>
                        <Text style={styles.sectionLabel}>Since You Started</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.improvScroll}
                        >
                            {improvements.map((item, idx) => (
                                <View key={idx} style={styles.improvCard}>
                                    <Text style={styles.improvIcon}>{item.icon}</Text>
                                    <Text style={styles.improvSkill}>{item.skill}</Text>
                                    <Text style={[styles.improvDelta, { color: item.delta >= 0 ? C.green : C.red }]}>
                                        {item.delta >= 0 ? '+' : ''}{item.delta}
                                    </Text>
                                    <Text style={styles.improvUnit}>points</Text>
                                </View>
                            ))}
                        </ScrollView>
                    </Animated.View>

                    {/* ─── 4. PERFORMANCE TREND ───────────────── */}
                    {trendData.length >= 2 && (
                        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.card}>
                            <Text style={styles.cardTitle}>Performance Trend</Text>
                            <PerformanceTrendSVG data={trendData} labels={trendLabels} />
                        </Animated.View>
                    )}

                    {/* ─── 5. SKILL BALANCE RADAR ─────────────── */}
                    <Animated.View entering={FadeInDown.delay(250).springify()} style={styles.card}>
                        <Text style={styles.cardTitle}>Skill Balance</Text>
                        <SkillRadarSVG current={currentScores} previous={previousScores} />
                        {/* Legend */}
                        <View style={styles.radarLegend}>
                            <View style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: C.gold }]} />
                                <Text style={styles.legendText}>Now</Text>
                            </View>
                            {previousScores && (
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: 'rgba(148,163,184,0.5)', borderWidth: 1, borderColor: C.textMuted, borderStyle: 'dashed' }]} />
                                    <Text style={styles.legendText}>Before</Text>
                                </View>
                            )}
                        </View>
                        {/* Weakest skill callout */}
                        <View style={styles.weakCallout}>
                            <Text style={styles.weakText}>
                                🎯 Focus: <Text style={{ color: C.red, fontWeight: '700' }}>{weakest.skill}</Text> needs work ({weakest.score}/100)
                            </Text>
                        </View>
                    </Animated.View>

                    {/* ─── 6. TOP MISTAKES ─────────────────────── */}
                    {topMistakes.length > 0 && (
                        <Animated.View entering={FadeInDown.delay(300).springify()}>
                            <Text style={styles.sectionLabel}>Your Top Mistakes</Text>
                            <Text style={styles.sectionSubtitle}>Tap any to see examples</Text>
                            {topMistakes.map(m => (
                                <MistakeCard key={m.id} mistake={m} />
                            ))}
                        </Animated.View>
                    )}

                    {/* ─── 7. MILESTONES ───────────────────────── */}
                    <Animated.View entering={FadeInDown.delay(350).springify()}>
                        <Text style={styles.sectionLabel}>Milestones</Text>
                        <View style={styles.milestonesGrid}>
                            {milestones.map(m => (
                                <View key={m.id} style={[styles.milestoneCard, !m.unlocked && styles.milestoneLocked]}>
                                    <Text style={{ fontSize: 28 }}>{m.unlocked ? m.icon : '🔒'}</Text>
                                    <Text style={[styles.milestoneTitle, !m.unlocked && { color: C.textMuted }]}>
                                        {m.title}
                                    </Text>
                                    <Text style={styles.milestoneDate}>{m.date}</Text>
                                </View>
                            ))}
                        </View>
                    </Animated.View>

                    {/* ─── 8. CTA BUTTON ──────────────────────── */}
                    <Animated.View entering={FadeInUp.delay(400).springify()} style={{ paddingHorizontal: 16, marginTop: 8 }}>
                        <LinearGradient
                            colors={[C.purple, '#a855f7']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.ctaCard}
                        >
                            <Text style={styles.ctaTitle}>Ready to improve?</Text>
                            <Text style={styles.ctaSubtitle}>
                                Practice {weakest.skill.toLowerCase()} — your weakest skill right now →
                            </Text>
                        </LinearGradient>
                    </Animated.View>

                    <View style={{ height: 100 }} />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

// ─── Helper: Level Label ──────────────────────────────────
function getLevelLabel(level: string): string {
    const map: Record<string, string> = {
        A1: 'Beginner', A2: 'Elementary',
        B1: 'Intermediate', B2: 'Upper-Int.',
        C1: 'Advanced', C2: 'Proficient',
    };
    return map[level] || 'Beginner';
}

// ═══════════════════════════════════════════════════════════
// SVG: Performance Trend Line Chart
// ═══════════════════════════════════════════════════════════
function PerformanceTrendSVG({ data, labels }: { data: number[]; labels: string[] }) {
    const chartW = CARD_WIDTH - 48;
    const chartH = 160;
    const padL = 30;
    const padR = 10;
    const padT = 24;
    const padB = 28;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;

    const minVal = Math.max(0, Math.min(...data) - 10);
    const maxVal = Math.min(100, Math.max(...data) + 10);
    const range = maxVal - minVal || 1;

    const points = data.map((val, i) => ({
        x: padL + (i / (data.length - 1)) * plotW,
        y: padT + plotH - ((val - minVal) / range) * plotH,
    }));

    const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
    const fillPath = `${padL},${padT + plotH} ${polyline} ${points[points.length - 1].x},${padT + plotH}`;
    const last = points[points.length - 1];

    return (
        <Svg width={chartW} height={chartH} style={{ alignSelf: 'center' }}>
            <Defs>
                <SvgLinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={C.green} stopOpacity="0.3" />
                    <Stop offset="1" stopColor={C.green} stopOpacity="0" />
                </SvgLinearGradient>
            </Defs>
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const yy = padT + plotH - pct * plotH;
                const val = Math.round(minVal + pct * range);
                return (
                    <React.Fragment key={i}>
                        <Line x1={padL} y1={yy} x2={padL + plotW} y2={yy}
                            stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
                        <SvgText x={padL - 6} y={yy + 4} fill={C.textMuted}
                            fontSize={10} textAnchor="end">{val}</SvgText>
                    </React.Fragment>
                );
            })}
            {/* Fill area */}
            <Polygon points={fillPath} fill="url(#trendFill)" />
            {/* Line */}
            <Polyline points={polyline} fill="none" stroke={C.green}
                strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {/* Dots */}
            {points.map((p, i) => (
                <Circle key={i} cx={p.x} cy={p.y} r={3.5}
                    fill="white" stroke={C.green} strokeWidth={2} />
            ))}
            {/* Last value label */}
            <SvgText x={last.x} y={last.y - 10} fill={C.green}
                fontSize={12} fontWeight="700" textAnchor="middle">
                {data[data.length - 1]}
            </SvgText>
            {/* X-axis labels */}
            {labels.map((label, i) => {
                const x = padL + (i / (labels.length - 1)) * plotW;
                return (
                    <SvgText key={i} x={x} y={chartH - 4} fill={C.textMuted}
                        fontSize={9} textAnchor="middle">{label}</SvgText>
                );
            })}
        </Svg>
    );
}

// ═══════════════════════════════════════════════════════════
// SVG: Skill Radar Chart (Full-Width)
// ═══════════════════════════════════════════════════════════
function SkillRadarSVG({ current, previous }: {
    current: { grammar: number; vocabulary: number; fluency: number; pronunciation: number };
    previous: { grammar: number; vocabulary: number; fluency: number; pronunciation: number } | null;
}) {
    const size = CARD_WIDTH - 48;
    const center = size / 2;
    const maxRadius = center - 40;

    const axes = [
        { key: 'grammar', label: 'Grammar', angle: -90 },
        { key: 'vocabulary', label: 'Vocabulary', angle: 0 },
        { key: 'fluency', label: 'Fluency', angle: 90 },
        { key: 'pronunciation', label: 'Pronunciation', angle: 180 },
    ];

    const getPoint = (angleDeg: number, r: number) => {
        const rad = (angleDeg * Math.PI) / 180;
        return {
            x: center + r * Math.cos(rad),
            y: center + r * Math.sin(rad),
        };
    };

    // Grid rings
    const gridLevels = [0.25, 0.5, 0.75, 1.0];

    // Current polygon
    const currentPoints = axes.map(axis => {
        const score = (current as any)[axis.key] || 0;
        const r = (score / 100) * maxRadius;
        return getPoint(axis.angle, r);
    });
    const currentPoly = currentPoints.map(p => `${p.x},${p.y}`).join(' ');

    // Previous polygon
    let previousPoly = '';
    if (previous) {
        const prevPoints = axes.map(axis => {
            const score = (previous as any)[axis.key] || 0;
            const r = (score / 100) * maxRadius;
            return getPoint(axis.angle, r);
        });
        previousPoly = prevPoints.map(p => `${p.x},${p.y}`).join(' ');
    }

    return (
        <Svg width={size} height={size} style={{ alignSelf: 'center', marginVertical: 8 }}>
            {/* Grid rings */}
            {gridLevels.map((level, i) => {
                const pts = axes.map(a => getPoint(a.angle, maxRadius * level));
                const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
                return (
                    <Polygon key={i} points={poly}
                        fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
                );
            })}
            {/* Axis lines */}
            {axes.map((axis, i) => {
                const end = getPoint(axis.angle, maxRadius);
                return (
                    <Line key={i} x1={center} y1={center} x2={end.x} y2={end.y}
                        stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
                );
            })}
            {/* Previous (ghost) polygon */}
            {previousPoly && (
                <Polygon points={previousPoly}
                    fill="rgba(148,163,184,0.08)" stroke={C.textMuted}
                    strokeWidth={1.5} strokeDasharray="6,4" />
            )}
            {/* Current polygon */}
            <Polygon points={currentPoly}
                fill="rgba(245,158,11,0.15)" stroke={C.gold} strokeWidth={2} />
            {/* Current dots */}
            {currentPoints.map((p, i) => (
                <Circle key={i} cx={p.x} cy={p.y} r={4}
                    fill={C.gold} stroke="white" strokeWidth={2} />
            ))}
            {/* Labels */}
            {axes.map((axis, i) => {
                const labelPos = getPoint(axis.angle, maxRadius + 24);
                let anchor: 'middle' | 'start' | 'end' = 'middle';
                if (axis.angle === 0) anchor = 'start';
                if (axis.angle === 180) anchor = 'end';
                return (
                    <SvgText key={i} x={labelPos.x} y={labelPos.y + 4}
                        fill={C.textPrimary} fontSize={12} fontWeight="600"
                        textAnchor={anchor}>
                        {axis.label}
                    </SvgText>
                );
            })}
        </Svg>
    );
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    safeArea: { flex: 1 },
    scrollContent: { paddingBottom: 32 },

    // ─── Header ──────────────────────────────────────────
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginTop: 8,
        marginBottom: 20,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: C.textPrimary,
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 14,
        color: C.textSecondary,
        marginTop: 2,
    },
    cefrBadge: {
        backgroundColor: C.goldLight,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(245,158,11,0.25)',
    },
    cefrLevel: {
        fontSize: 18,
        fontWeight: '800',
        color: C.gold,
    },
    cefrLabel: {
        fontSize: 10,
        color: C.gold,
        fontWeight: '600',
        marginTop: 1,
    },

    // ─── Hero Card ───────────────────────────────────────
    heroCard: {
        marginHorizontal: 16,
        borderRadius: 20,
        padding: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(245,158,11,0.15)',
        marginBottom: 24,
    },
    heroLeft: {},
    heroLabel: {
        fontSize: 14,
        color: C.textSecondary,
        fontWeight: '500',
    },
    heroScore: {
        fontSize: 52,
        fontWeight: '900',
        color: C.textPrimary,
        letterSpacing: -2,
        marginTop: -4,
    },
    heroDelta: {
        fontSize: 13,
        fontWeight: '600',
        marginTop: -2,
    },
    heroRings: {
        gap: 10,
    },
    ringRow: {
        flexDirection: 'row',
        gap: 10,
    },

    // ─── Section Labels ──────────────────────────────────
    sectionLabel: {
        fontSize: 18,
        fontWeight: '700',
        color: C.textPrimary,
        paddingHorizontal: 16,
        marginBottom: 4,
    },
    sectionSubtitle: {
        fontSize: 13,
        color: C.textMuted,
        paddingHorizontal: 16,
        marginBottom: 12,
    },

    // ─── Improvement Cards (horizontal scroll) ───────────
    improvScroll: {
        paddingHorizontal: 16,
        gap: 12,
        paddingVertical: 8,
        marginBottom: 16,
    },
    improvCard: {
        backgroundColor: C.cardBg,
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        width: 100,
        borderWidth: 1,
        borderColor: C.cardBorder,
    },
    improvIcon: { fontSize: 24, marginBottom: 6 },
    improvSkill: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
    improvDelta: { fontSize: 24, fontWeight: '800', marginTop: 4 },
    improvUnit: { fontSize: 11, color: C.textMuted, marginTop: 2 },

    // ─── Card ────────────────────────────────────────────
    card: {
        marginHorizontal: 16,
        backgroundColor: C.cardBg,
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: C.cardBorder,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: C.textPrimary,
        marginBottom: 12,
    },

    // ─── Radar Legend ────────────────────────────────────
    radarLegend: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 20,
        marginTop: 4,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    legendText: {
        fontSize: 12,
        color: C.textSecondary,
        fontWeight: '500',
    },

    // ─── Weak Skill Callout ─────────────────────────────
    weakCallout: {
        marginTop: 12,
        backgroundColor: 'rgba(239,68,68,0.06)',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.12)',
    },
    weakText: {
        fontSize: 13,
        color: C.textPrimary,
        fontWeight: '500',
    },

    // ─── Mistake Cards ──────────────────────────────────
    mistakeCard: {
        marginHorizontal: 16,
        backgroundColor: C.cardBg,
        borderRadius: 16,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: C.cardBorder,
    },
    mistakeTop: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    catBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 8,
        marginBottom: 6,
    },
    catBadgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    mistakePattern: {
        fontSize: 15,
        fontWeight: '600',
        color: C.textPrimary,
    },
    trendLabel: {
        fontSize: 12,
        fontWeight: '600',
    },
    sessionCount: {
        fontSize: 12,
        color: C.textMuted,
    },
    occCount: {
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 8,
        alignItems: 'center',
        marginLeft: 12,
    },
    occNumber: {
        fontSize: 22,
        fontWeight: '800',
    },
    occLabel: {
        fontSize: 10,
        color: C.textMuted,
    },

    // ─── Mistake Detail (expanded) ──────────────────────
    mistakeDetail: {
        marginTop: 14,
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
    },
    exampleRow: {
        marginBottom: 4,
    },
    exWrong: {
        fontSize: 12,
        fontWeight: '600',
        color: C.red,
        marginBottom: 2,
    },
    exWrongText: {
        fontSize: 14,
        color: C.textPrimary,
        fontStyle: 'italic',
        paddingLeft: 24,
    },
    exRight: {
        fontSize: 12,
        fontWeight: '600',
        color: C.green,
        marginBottom: 2,
    },
    exRightText: {
        fontSize: 14,
        color: C.textPrimary,
        fontWeight: '600',
        paddingLeft: 24,
    },

    // ─── Milestones ─────────────────────────────────────
    milestonesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 16,
        gap: 12,
        marginBottom: 20,
    },
    milestoneCard: {
        width: (SCREEN_WIDTH - 44) / 2,
        backgroundColor: C.cardBg,
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: C.cardBorder,
    },
    milestoneLocked: {
        opacity: 0.45,
    },
    milestoneTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: C.textPrimary,
        marginTop: 8,
        textAlign: 'center',
    },
    milestoneDate: {
        fontSize: 11,
        color: C.textMuted,
        marginTop: 4,
    },

    // ─── CTA ─────────────────────────────────────────────
    ctaCard: {
        borderRadius: 20,
        padding: 24,
    },
    ctaTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: 'white',
    },
    ctaSubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 6,
    },
});
