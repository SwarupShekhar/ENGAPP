import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, StatusBar, Dimensions,
    TouchableOpacity, LayoutAnimation, Animated as RNAnimated, Platform, UIManager
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useUser } from '@clerk/clerk-expo';
import Svg, { Circle, Polygon, Line, Text as SvgText, Polyline } from 'react-native-svg';

import { sessionsApi, ConversationSession } from '../api/sessions';
import { userApi, UserStats } from '../api/user';
import { reliabilityApi } from '../api/reliability';

// New Growth Components
import ProfileHeader from '../components/growth/ProfileHeader';
import SkillSummary from '../components/growth/SkillSummary';
import WeakAreaCard from '../components/growth/WeakAreaCard';
import RecentActivityAccordion from '../components/growth/RecentActivityAccordion';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Colors (Light Theme) ──────────────────────────────────
const C = {
    bg: '#F0F2F8',          // Light grayish blue background matching Home
    cardBg: '#FFFFFF',
    cardBorder: '#E2E8F0',
    gold: '#F59E0B',
    green: '#10B981',
    red: '#EF4444',
    purple: '#8B5CF6',
    blue: '#3B82F6',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    indigo: '#6366F1',
};

const categoryColors: Record<string, string> = {
    Grammar: C.purple,
    Pronunciation: C.blue,
    Fluency: C.gold,
    Vocabulary: C.green,
};

// ─── Skeleton Placeholder ─────────────────────────────────
function Skeleton({ width, height, style }: { width: number | string; height: number; style?: any }) {
    return <View style={[{ width, height, borderRadius: 12, backgroundColor: '#E2E8F0' }, style]} />;
}

// ─── Mistake Card ──────────────────────────────────────────
function MistakeCard({ mistake }: { mistake: any }) {
    const [expanded, setExpanded] = useState(false);
    const toggleExpanded = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(!expanded);
    };
    const catColor = categoryColors[mistake.category] || C.textSecondary;

    return (
        <TouchableOpacity activeOpacity={0.8} onPress={toggleExpanded} style={styles.mistakeCard}>
            <View style={styles.mistakeTop}>
                <View style={{ flex: 1 }}>
                    <View style={[styles.catBadge, { backgroundColor: catColor + '15' }]}>
                        <Text style={[styles.catBadgeText, { color: catColor }]}>{mistake.category}</Text>
                    </View>
                    <Text style={styles.mistakePattern}>{mistake.pattern}</Text>
                </View>
                <View style={[styles.occCount, { backgroundColor: C.bg }]}>
                    <Text style={[styles.occNumber, { color: C.textPrimary }]}>{mistake.occurrences}</Text>
                    <Text style={styles.occLabel}>times</Text>
                </View>
            </View>
            {expanded && (
                <View style={styles.mistakeDetail}>
                    <View style={styles.exampleRow}>
                        <Text style={styles.exWrong}>❌  You said:</Text>
                        <Text style={styles.exWrongText}>"{mistake.example_wrong}"</Text>
                    </View>
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
    const navigation: any = useNavigation();
    const insets = useSafeAreaInsets();
    const [stats, setStats] = useState<UserStats | null>(null);
    const [sessions, setSessions] = useState<ConversationSession[]>([]);
    const [reliabilityScore, setReliabilityScore] = useState(85);
    const [loading, setLoading] = useState(true);

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
                    
                    if (user?.id) {
                        const relData = await reliabilityApi.getUserReliability(user.id);
                        if (relData) setReliabilityScore(relData.reliabilityScore);
                    }
                } catch (error) {
                    console.error('Failed to fetch progress data:', error);
                } finally {
                    setLoading(false);
                }
            };
            fetchData();
        }, [user?.id])
    );

    const validSessions = sessions.filter(s => s.analyses && s.analyses.length > 0 && s.analyses[0].scores);

    const currentScores = {
        grammar: Math.min(100, stats?.grammarScore ?? 0),
        vocabulary: Math.min(100, stats?.vocabScore ?? 0),
        fluency: Math.min(100, stats?.fluencyScore ?? 0),
        pronunciation: Math.min(100, stats?.pronunciationScore ?? 0),
        overall: stats?.feedbackScore ? Math.min(100, Math.round(stats.feedbackScore)) : 0,
    };

    const skillEntries = [
        { name: 'Grammar', score: currentScores.grammar },
        { name: 'Vocabulary', score: currentScores.vocabulary },
        { name: 'Fluency', score: currentScores.fluency },
        { name: 'Pronunciation', score: currentScores.pronunciation },
    ];
    const weakest = skillEntries.reduce((min, e) => e.score < min.score ? e : min, skillEntries[0]);

    const trendSessions = validSessions.slice(0, 7).reverse();
    const trendData = trendSessions.map(s => s.analyses![0].scores.overall);
    const trendLabels = trendSessions.map(s => {
        const d = new Date(s.startedAt);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const mistakeMap = new Map<string, any>();
    validSessions.forEach(s => {
        (s.analyses?.[0]?.mistakes || []).forEach(m => {
            const key = m.type || m.rule || 'Unknown';
            if (mistakeMap.has(key)) {
                mistakeMap.get(key).occurrences += 1;
            } else {
                mistakeMap.set(key, {
                    id: mistakeMap.size + 1,
                    category: m.type?.includes('Grammar') || m.rule ? 'Grammar' : m.type?.includes('Pronun') ? 'Pronunciation' : 'Vocabulary',
                    pattern: key,
                    occurrences: 1,
                    example_wrong: m.original || '',
                    example_right: m.corrected || '',
                });
            }
        });
    });
    const topMistakes = Array.from(mistakeMap.values()).sort((a, b) => b.occurrences - a.occurrences).slice(0, 5);

    if (loading) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="dark-content" backgroundColor="#4F46E5" />
                <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.safeArea}>
                    <View style={{ padding: 20, paddingTop: insets.top + 20 }}>
                        <Skeleton width="100%" height={140} style={{ marginBottom: 20 }} />
                        <Skeleton width="100%" height={80} style={{ marginBottom: 20 }} />
                        <Skeleton width="100%" height={260} style={{ marginBottom: 20 }} />
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#4F46E5" />
            
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                
                <ProfileHeader 
                        user={user}
                        stats={stats}
                        reliabilityScore={reliabilityScore}
                        onSettingsPress={() => navigation.navigate('Profile')}
                    />

                    <View style={{ paddingHorizontal: 20 }}>
                        <Animated.View entering={FadeInDown.delay(100).springify()}>
                            <WeakAreaCard 
                                skillName={weakest.name}
                                score={weakest.score}
                                onImprovePress={() => navigation.navigate('CallPreference')}
                            />
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(200).springify()}>
                            <SkillSummary scores={currentScores} />
                        </Animated.View>

                        {trendData.length >= 2 && (
                            <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.card}>
                                <Text style={styles.cardTitle}>Score History</Text>
                                <PerformanceTrendSVG data={trendData} labels={trendLabels} />
                            </Animated.View>
                        )}

                        <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.card}>
                            <Text style={styles.cardTitle}>Skill Balance</Text>
                            <SkillRadarSVG current={currentScores} />
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(500).springify()}>
                            <RecentActivityAccordion sessions={validSessions} />
                        </Animated.View>

                        {topMistakes.length > 0 && (
                            <Animated.View entering={FadeInDown.delay(600).springify()} style={{ marginBottom: 40 }}>
                                <Text style={styles.sectionLabel}>Learning Opportunities</Text>
                                <Text style={styles.sectionSubtitle}>Focus on these patterns to improve your score</Text>
                                {topMistakes.map(m => (
                                    <MistakeCard key={m.id} mistake={m} />
                                ))}
                            </Animated.View>
                        )}
                    </View>
                </ScrollView>
        </View>
    );
}

function PerformanceTrendSVG({ data, labels }: { data: number[]; labels: string[] }) {
    const chartW = SCREEN_WIDTH - 80;
    const chartH = 140; // Increased height to accommodate labels
    const padL = 20;    // Left padding
    const padR = 20;    // Right padding
    const padT = 30;    // Top padding for the latest score text
    const padB = 30;    // Bottom padding for the date labels
    
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;
    
    const minVal = Math.max(0, Math.min(...data) - 10);
    const maxVal = Math.min(100, Math.max(...data) + 10);
    const range = maxVal - minVal || 1;

    const points = data.map((val, i) => ({
        x: padL + ((i / Math.max(1, data.length - 1)) * plotW),
        y: padT + plotH - ((val - minVal) / range) * plotH,
    }));
    const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

    return (
        <Svg width={chartW} height={chartH} style={{ alignSelf: 'center' }}>
            {/* Grid lines */}
            {[0, 0.5, 1].map((level, i) => {
                const y = padT + (plotH * level);
                return (
                    <Line key={`grid-${i}`} x1={0} y1={y} x2={chartW} y2={y} stroke={C.cardBorder} strokeWidth={1} />
                );
            })}
            
            {/* Trend Line Background Shadow */}
            <Polyline points={polyline} fill="none" stroke="rgba(16, 185, 129, 0.15)" strokeWidth={8} strokeLinejoin="round" />
            {/* Main Trend Line */}
            <Polyline points={polyline} fill="none" stroke={C.green} strokeWidth={3} strokeLinejoin="round" />
            
            {/* Data Points & Score Labels */}
            {points.map((p, i) => (
                <React.Fragment key={`point-${i}`}>
                    <Circle cx={p.x} cy={p.y} r={4} fill={C.cardBg} stroke={C.green} strokeWidth={2} />
                    {/* Only show label for the latest session (last point) or if there are very few sessions to avoid clutter */}
                    {(i === points.length - 1 || data.length <= 3) && (
                        <SvgText 
                            x={p.x} 
                            y={p.y - 12} 
                            fill={C.green} 
                            fontSize={12} 
                            fontWeight="bold"
                            textAnchor="middle"
                        >
                            {data[i]}
                        </SvgText>
                    )}
                </React.Fragment>
            ))}
            
            {/* X-Axis Labels (Dates) */}
            {labels.map((label, i) => {
                const p = points[i];
                // Try to not overlap labels by only showing every other one if tracking 7 days
                if (data.length > 5 && i % 2 !== 0 && i !== labels.length - 1) return null;
                
                return (
                    <SvgText 
                        key={`label-${i}`} 
                        x={p.x} 
                        y={chartH - 10} 
                        fill={C.textSecondary} 
                        fontSize={10} 
                        textAnchor={i === 0 ? "start" : (i === labels.length - 1 ? "end" : "middle")}
                    >
                        {label}
                    </SvgText>
                );
            })}
        </Svg>
    );
}

function SkillRadarSVG({ current }: { current: any }) {
    const size = SCREEN_WIDTH - 80;
    const center = size / 2;
    const maxR = center - 45; // More room for labels
    
    const axes = [
        { k: 'grammar', a: -90, label: 'Grammar' }, 
        { k: 'vocabulary', a: 0, label: 'Vocab' }, 
        { k: 'fluency', a: 90, label: 'Fluency' }, 
        { k: 'pronunciation', a: 180, label: 'Pronunciation' }
    ];
    
    const getPoint = (angleDeg: number, r: number) => {
        const rad = (angleDeg * Math.PI) / 180;
        return {
            x: center + r * Math.cos(rad),
            y: center + r * Math.sin(rad),
        };
    };

    const pts = axes.map(ax => {
        const r = (current[ax.k] / 100) * maxR;
        return `${getPoint(ax.a, r).x},${getPoint(ax.a, r).y}`;
    }).join(' ');

    return (
        <View style={{ height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size}>
                {/* Grid levels */}
                {[0.25, 0.5, 0.75, 1.0].map((level, i) => {
                    const polyPts = axes.map(a => {
                        const p = getPoint(a.a, maxR * level);
                        return `${p.x},${p.y}`;
                    }).join(' ');
                    return <Polygon key={`grid-${i}`} points={polyPts} fill="none" stroke={C.cardBorder} strokeWidth={1} strokeDasharray={[2, 2]} />;
                })}
                
                {/* Axes lines */}
                {axes.map((axis, i) => {
                    const endPos = getPoint(axis.a, maxR);
                    return <Line key={`axis-${i}`} x1={center} y1={center} x2={endPos.x} y2={endPos.y} stroke={C.cardBorder} strokeWidth={1} />;
                })}
                
                {/* Current data polygon */}
                <Polygon points={pts} fill="rgba(99, 102, 241, 0.15)" stroke={C.indigo} strokeWidth={3} />
                
                {/* Labels */}
                {axes.map((axis, i) => {
                    const labelPos = getPoint(axis.a, maxR + 25);
                    let anchor: 'middle' | 'start' | 'end' = 'middle';
                    if (axis.a === 0) anchor = 'start';
                    if (axis.a === 180) anchor = 'end';
                    return (
                        <SvgText 
                            key={`label-${i}`} 
                            x={labelPos.x} 
                            y={labelPos.y + 4} 
                            fill={C.textSecondary} 
                            fontSize={10} 
                            fontWeight="700"
                            textAnchor={anchor}
                        >
                            {axis.label.toUpperCase()}
                        </SvgText>
                    );
                })}
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    safeArea: { flex: 1 },
    scrollContent: { paddingBottom: 120 },
    card: {
        backgroundColor: C.cardBg,
        borderRadius: 20,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: C.cardBorder,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    cardTitle: { color: C.textPrimary, fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
    sectionLabel: { fontSize: 18, fontWeight: '700', color: C.textPrimary, marginBottom: 4 },
    sectionSubtitle: { fontSize: 13, color: C.textSecondary, marginBottom: 16 },
    mistakeCard: { 
        backgroundColor: C.cardBg, 
        borderRadius: 16, 
        padding: 16, 
        marginBottom: 12, 
        borderWidth: 1, 
        borderColor: C.cardBorder,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 1,
    },
    mistakeTop: { flexDirection: 'row', alignItems: 'center' },
    catBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 8, alignSelf: 'flex-start' },
    catBadgeText: { fontSize: 10, fontWeight: 'bold' },
    mistakePattern: { color: C.textPrimary, fontSize: 15, fontWeight: '600' },
    occCount: { borderRadius: 12, padding: 8, alignItems: 'center', marginLeft: 12 },
    occNumber: { fontSize: 18, fontWeight: '800' },
    occLabel: { fontSize: 9, color: C.textMuted },
    mistakeDetail: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.cardBorder },
    exampleRow: { marginBottom: 6 },
    exWrong: { fontSize: 11, fontWeight: 'bold', color: C.red },
    exWrongText: { fontSize: 13, color: C.textPrimary, fontStyle: 'italic', paddingLeft: 16 },
    exRight: { fontSize: 11, fontWeight: 'bold', color: C.green },
    exRightText: { fontSize: 13, color: C.textPrimary, fontWeight: '600', paddingLeft: 16 },
});
