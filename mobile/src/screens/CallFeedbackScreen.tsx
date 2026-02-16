import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { theme } from '../theme/theme';
import { sessionsApi, ConversationSession } from '../api/sessions';

// Feedback Components
import { WordLevelBreakdown } from '../components/feedback/WordLevelBreakdown';
import { PracticeTips } from '../components/feedback/PracticeTips';
import { GrammarVocabBreakdown } from '../components/feedback/GrammarVocabBreakdown';
import { ScoreBreakdownCard } from '../components/feedback/ScoreBreakdownCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Skill Bar Component ──────────────────────────────────
function SkillBar({ label, score, icon, color, delay }: {
    label: string; score: number; icon: string; color: string; delay: number;
}) {
    const clampedScore = Math.min(100, Math.max(0, score));
    return (
        <Animated.View entering={FadeInRight.delay(delay).springify()} style={styles.skillRow}>
            <View style={styles.skillInfo}>
                <View style={[styles.skillIcon, { backgroundColor: color + '15' }]}>
                    <Ionicons name={icon as any} size={16} color={color} />
                </View>
                <Text style={styles.skillLabel}>{label}</Text>
            </View>
            <View style={styles.barContainer}>
                <View style={[styles.barFill, { width: `${clampedScore}%`, backgroundColor: color }]} />
            </View>
            <Text style={[styles.skillScore, { color }]}>{clampedScore}%</Text>
        </Animated.View>
    );
}

// ─── Severity Badge ───────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
    const colors: Record<string, { bg: string; text: string }> = {
        critical: { bg: theme.colors.error + '15', text: theme.colors.error },
        major: { bg: theme.colors.warning + '15', text: theme.colors.warning },
        high: { bg: theme.colors.error + '15', text: theme.colors.error },
        medium: { bg: theme.colors.warning + '15', text: theme.colors.warning },
        minor: { bg: '#10B98115', text: '#10B981' },
        low: { bg: theme.colors.success + '15', text: theme.colors.success },
        suggestion: { bg: theme.colors.primary + '15', text: theme.colors.primary },
    };
    const c = colors[severity?.toLowerCase()] || colors.medium;
    return (
        <View style={[styles.severityBadge, { backgroundColor: c.bg }]}>
            <Text style={[styles.severityText, { color: c.text }]}>
                {severity?.charAt(0).toUpperCase() + severity?.slice(1) || 'Medium'}
            </Text>
        </View>
    );
}

// ─── Mistake Card ─────────────────────────────────────────
function MistakeCard({ item, index }: { item: any; index: number }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <Animated.View entering={FadeInDown.delay(600 + index * 100).springify()}>
            <TouchableOpacity
                style={styles.mistakeCard}
                activeOpacity={0.8}
                onPress={() => setExpanded(!expanded)}
            >
                <View style={styles.mistakeHeader}>
                    <View style={styles.mistakeTypeRow}>
                        <View style={styles.mistakeTypePill}>
                            <Text style={styles.mistakeTypeText}>{item.rule || item.type}</Text>
                        </View>
                        <SeverityBadge severity={item.severity} />
                    </View>
                    <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={theme.colors.text.secondary}
                    />
                </View>

                <View style={styles.mistakeContent}>
                    <View style={styles.mistakeLine}>
                        <View style={[styles.mistakeDot, { backgroundColor: theme.colors.error }]} />
                        <Text style={styles.originalText}>{item.original}</Text>
                    </View>
                    <View style={styles.mistakeLine}>
                        <View style={[styles.mistakeDot, { backgroundColor: theme.colors.success }]} />
                        <Text style={styles.correctedText}>{item.corrected}</Text>
                    </View>
                </View>

                {expanded && (
                    <View style={styles.explanationContainer}>
                        <Ionicons name="bulb-outline" size={16} color={theme.colors.primary} />
                        <Text style={styles.explanationText}>{item.explanation}</Text>
                    </View>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
}

// ─── Score Color Helper ───────────────────────────────────
function getScoreColor(score: number) {
    if (score >= 80) return theme.colors.success;
    if (score >= 60) return theme.colors.warning;
    if (score >= 40) return '#F59E0B';
    return theme.colors.error;
}

// ─── Main Component ───────────────────────────────────────
export default function CallFeedbackScreen({ navigation, route }: any) {
    const [loading, setLoading] = useState(true);
    const [sessionData, setSessionData] = useState<ConversationSession | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(true);

    const params = route?.params || {};
    const sessionId = params.sessionId;
    const partnerName = params.partnerName || 'Co-learner';
    const topic = params.topic || 'General Practice';
    const callDuration = params.duration || 0;

    useEffect(() => {
        let isMounted = true;
        const fetchAnalysis = async () => {
            if (!sessionId || sessionId === 'session-id') {
                console.warn('[CallFeedback] Invalid or placeholder sessionId provided');
                setLoading(false);
                return;
            }

            try {
                const data = await sessionsApi.getSessionAnalysis(sessionId);
                if (data.analyses && data.analyses.length > 0) {
                    if (isMounted) {
                        setSessionData(data);
                        setLoading(false);
                    }
                } else if (retryCount < 10) {
                    setTimeout(() => {
                        if (isMounted) setRetryCount(prev => prev + 1);
                    }, 5000);
                } else {
                    if (isMounted) setLoading(false);
                }
            } catch (error) {
                console.error('Failed to fetch session analysis:', error);
                if (isMounted) setLoading(false);
            }
        };

        fetchAnalysis();
        return () => { isMounted = false; };
    }, [sessionId, retryCount]);

    const formatDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    };

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <StatusBar barStyle="dark-content" />
                <View style={{ alignItems: 'center', gap: 20 }}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                    <Text style={{ fontSize: 18, fontWeight: '600', color: theme.colors.text.primary }}>
                        AI is analyzing your call...
                    </Text>
                    <Text style={{ color: theme.colors.text.secondary, textAlign: 'center', paddingHorizontal: 40 }}>
                        We're preparing your personalized feedback and corrections.
                    </Text>
                    {retryCount > 0 && (
                        <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>
                            Attempt {retryCount + 1}/10
                        </Text>
                    )}
                </View>
            </SafeAreaView>
        );
    }

    const currentAnalysis = sessionData?.analyses?.[0];
    const rawData = currentAnalysis?.rawData;
    const data = {
        overallScore: Math.min(100, currentAnalysis?.scores?.overall || 0),
        cefrLevel: currentAnalysis?.cefrLevel || 'B1',
        scores: {
            grammar: Math.min(100, currentAnalysis?.scores?.grammar || 0),
            pronunciation: Math.min(100, currentAnalysis?.scores?.pronunciation || 0),
            fluency: Math.min(100, currentAnalysis?.scores?.fluency || 0),
            vocabulary: Math.min(100, currentAnalysis?.scores?.vocabulary || 0),
        },
        mistakes: currentAnalysis?.mistakes || [],
        pronunciationIssues: currentAnalysis?.pronunciationIssues || [],
        aiFeedback: (rawData as any)?.ai_detailed_feedback || null,
        actionableFeedback: (rawData as any)?.actionable_feedback || null,
        wordLevelData: (rawData as any)?.detailed_errors?.word_level_scores || [],
        strengths: rawData?.strengths || [],
        improvementAreas: rawData?.improvementAreas || [],
        accentNotes: rawData?.accentNotes || null,
        pronunciationTip: rawData?.pronunciationTip || null,
    };

    const overallColor = getScoreColor(data.overallScore);

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Call Feedback</Text>
                    <View style={styles.backButton} />
                </View>

                {/* Meta Info */}
                <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.metaRow}>
                    <View style={styles.metaPill}>
                        <Ionicons name="person" size={12} color={theme.colors.text.secondary} />
                        <Text style={styles.metaText}>{partnerName}</Text>
                    </View>
                    <View style={styles.metaPill}>
                        <Ionicons name="chatbubbles" size={12} color={theme.colors.text.secondary} />
                        <Text style={styles.metaText}>{topic}</Text>
                    </View>
                    {callDuration > 0 && (
                        <View style={styles.metaPill}>
                            <Ionicons name="time" size={12} color={theme.colors.text.secondary} />
                            <Text style={styles.metaText}>{formatDuration(callDuration)}</Text>
                        </View>
                    )}
                </Animated.View>

                {/* Score Hero Card */}
                <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.scoreCard}>
                    <LinearGradient
                        colors={theme.colors.gradients.primary}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.scoreGradient}
                    >
                        <Text style={styles.scoreLabel}>Overall Score</Text>
                        <View style={styles.scoreRow}>
                            <Text style={styles.scoreValue}>{data.overallScore}</Text>
                            <Text style={styles.scoreMax}>/100</Text>
                        </View>
                        <View style={styles.levelChip}>
                            <Text style={styles.levelChipText}>{data.cefrLevel}</Text>
                        </View>
                    </LinearGradient>
                </Animated.View>

                {/* New Score Breakdown */}
                <Animated.View entering={FadeInDown.delay(300).springify()}>
                    <ScoreBreakdownCard
                        scores={data.scores}
                        justifications={{
                            pronunciation: data.aiFeedback?.pronunciation?.justification,
                            grammar: data.aiFeedback?.grammar?.justification,
                            vocabulary: data.aiFeedback?.vocabulary?.justification,
                            fluency: data.aiFeedback?.fluency?.justification,
                        }}
                    />
                </Animated.View>

                {/* Detail Toggle */}
                <TouchableOpacity
                    style={styles.detailToggle}
                    onPress={() => setShowDetailedAnalysis(!showDetailedAnalysis)}
                >
                    <Text style={styles.detailToggleText}>
                        {showDetailedAnalysis ? '📊 Hide' : '📊 Show'} Detailed Analysis
                    </Text>
                </TouchableOpacity>

                {showDetailedAnalysis && (
                    <Animated.View entering={FadeInDown.delay(350).springify()}>
                        {/* Word Level Breakdown */}
                        {data.wordLevelData && data.wordLevelData.length > 0 && (
                            <WordLevelBreakdown wordScores={data.wordLevelData} />
                        )}

                        {/* Grammar & Vocabulary Breakdown */}
                        {(data.aiFeedback?.grammar || data.aiFeedback?.vocabulary) && (
                            <GrammarVocabBreakdown
                                grammar={data.aiFeedback?.grammar || {
                                    score: 0,
                                    errors: [],
                                    strengths: [],
                                    cefr_level: 'A1',
                                    justification: 'No grammar analysis available.'
                                }}
                                vocabulary={data.aiFeedback?.vocabulary || {
                                    score: 0,
                                    word_count: 0,
                                    unique_words: 0,
                                    advanced_words: [],
                                    repetitions: {},
                                    inappropriate_words: {},
                                    cefr_level: 'A1',
                                    justification: 'No vocabulary analysis available.'
                                }}
                            />
                        )}

                        {/* Actionable Practice Tips */}
                        {data.actionableFeedback && (
                            <PracticeTips actionableFeedback={data.actionableFeedback} />
                        )}
                    </Animated.View>
                )}

                {/* Accent & Pronunciation Analysis */}
                {(data.accentNotes || data.pronunciationTip) && (
                    <Animated.View entering={FadeInDown.delay(750).springify()}>
                        <Text style={styles.sectionTitle}>Accent & Pronunciation</Text>
                        <View style={styles.glassCard}>
                            <View style={styles.accentHeader}>
                                <View style={styles.accentIconContainer}>
                                    <Ionicons name="globe-outline" size={20} color="#6366F1" />
                                </View>
                                <Text style={styles.accentTitle}>Accent Analysis</Text>
                            </View>
                            {data.accentNotes && (
                                <Text style={styles.accentText}>{data.accentNotes}</Text>
                            )}
                            {data.pronunciationTip && (
                                <View style={styles.tipRow}>
                                    <Ionicons name="bulb-outline" size={14} color={theme.colors.warning} />
                                    <Text style={styles.tipText}>{data.pronunciationTip}</Text>
                                </View>
                            )}
                        </View>
                    </Animated.View>
                )}

                {/* Strengths & Areas to Improve */}
                {(data.strengths.length > 0 || data.improvementAreas.length > 0) && (
                    <Animated.View entering={FadeInDown.delay(800).springify()}>
                        <Text style={styles.sectionTitle}>Performance Breakdown</Text>
                        <View style={styles.strengthsRow}>
                            {data.strengths.length > 0 && (
                                <View style={[styles.strengthCard, { borderLeftColor: theme.colors.success }]}>
                                    <View style={styles.strengthHeader}>
                                        <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                                        <Text style={[styles.strengthTitle, { color: theme.colors.success }]}>Strengths</Text>
                                    </View>
                                    {data.strengths.map((s, i) => (
                                        <Text key={i} style={styles.strengthItem}>• {s}</Text>
                                    ))}
                                </View>
                            )}
                            {data.improvementAreas.length > 0 && (
                                <View style={[styles.strengthCard, { borderLeftColor: theme.colors.warning }]}>
                                    <View style={styles.strengthHeader}>
                                        <Ionicons name="trending-up" size={16} color={theme.colors.warning} />
                                        <Text style={[styles.strengthTitle, { color: theme.colors.warning }]}>Improve</Text>
                                    </View>
                                    {data.improvementAreas.map((a, i) => (
                                        <Text key={i} style={styles.strengthItem}>• {a}</Text>
                                    ))}
                                </View>
                            )}
                        </View>
                    </Animated.View>
                )}

                {/* Key Mistakes */}
                <Text style={styles.sectionTitle}>
                    Key Mistakes {data.mistakes.length > 0 && `(${data.mistakes.length})`}
                </Text>
                {data.mistakes.length > 0 ? (
                    data.mistakes.map((item, index) => (
                        <MistakeCard key={item.id || index} item={item} index={index} />
                    ))
                ) : (
                    <View style={styles.glassCard}>
                        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                            <Ionicons name="checkmark-circle" size={32} color={theme.colors.success} />
                            <Text style={{ color: theme.colors.text.secondary, fontSize: 14, marginTop: 8 }}>
                                No significant mistakes found. Keep it up!
                            </Text>
                        </View>
                    </View>
                )}

                {/* AI Summary */}
                {data.aiFeedback && (
                    <Animated.View entering={FadeInDown.delay(1000).springify()}>
                        <Text style={styles.sectionTitle}>AI Summary</Text>
                        <View style={styles.glassCard}>
                            <View style={styles.summaryHeader}>
                                <LinearGradient
                                    colors={theme.colors.gradients.primary}
                                    style={styles.aiIcon}
                                >
                                    <Ionicons name="sparkles" size={14} color="white" />
                                </LinearGradient>
                                <Text style={styles.aiLabel}>EngR AI Analysis</Text>
                            </View>
                            <Text style={styles.summaryText}>{data.aiFeedback}</Text>
                        </View>
                    </Animated.View>
                )}

                {/* Action Buttons */}
                <Animated.View entering={FadeInDown.delay(1100).springify()} style={styles.actions}>
                    <TouchableOpacity
                        style={styles.primaryAction}
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('Call')}
                    >
                        <LinearGradient
                            colors={theme.colors.gradients.primary}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.actionGradient}
                        >
                            <Ionicons name="call" size={20} color="white" />
                            <Text style={styles.primaryActionText}>Practice Again</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.secondaryAction}
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('Home')}
                    >
                        <Ionicons name="home-outline" size={20} color={theme.colors.primary} />
                        <Text style={styles.secondaryActionText}>Back to Home</Text>
                    </TouchableOpacity>
                </Animated.View>

                <View style={{ height: 120 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

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
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.s,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
    },
    metaRow: {
        flexDirection: 'row',
        paddingHorizontal: theme.spacing.l,
        gap: theme.spacing.s,
        marginBottom: theme.spacing.m,
        flexWrap: 'wrap',
    },
    metaPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.6)',
    },
    metaText: {
        fontSize: theme.typography.sizes.xs,
        color: theme.colors.text.secondary,
        fontWeight: '500',
    },
    scoreCard: {
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.l,
        borderRadius: theme.borderRadius.xl,
        ...theme.shadows.medium,
    },
    scoreGradient: {
        borderRadius: theme.borderRadius.xl,
        paddingVertical: theme.spacing.xl,
        alignItems: 'center',
    },
    scoreLabel: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: theme.typography.sizes.m,
        fontWeight: '500',
        marginBottom: theme.spacing.s,
    },
    scoreRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    scoreValue: {
        color: 'white',
        fontSize: 64,
        fontWeight: 'bold',
    },
    scoreMax: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: theme.typography.sizes.xl,
        fontWeight: '500',
        marginLeft: 4,
    },
    levelChip: {
        marginTop: theme.spacing.m,
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    levelChipText: {
        color: 'white',
        fontSize: theme.typography.sizes.m,
        fontWeight: '700',
    },
    sectionTitle: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        paddingHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.m,
        marginTop: theme.spacing.m,
    },
    // Glassmorphism card used for all sections
    glassCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        marginHorizontal: theme.spacing.l,
        borderRadius: 16,
        padding: theme.spacing.m,
        gap: theme.spacing.m,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.6)',
        ...theme.shadows.medium,
    },
    skillRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.s,
    },
    skillInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        width: 130,
    },
    skillIcon: {
        width: 28,
        height: 28,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    skillLabel: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '500',
        color: theme.colors.text.primary,
    },
    barContainer: {
        flex: 1,
        height: 8,
        borderRadius: 4,
        backgroundColor: theme.colors.border,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: 4,
    },
    skillScore: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '700',
        width: 40,
        textAlign: 'right',
    },
    // Accent section
    accentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    accentIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#6366F115',
        justifyContent: 'center',
        alignItems: 'center',
    },
    accentTitle: {
        fontSize: theme.typography.sizes.m,
        fontWeight: '700',
        color: theme.colors.text.primary,
    },
    accentText: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
        lineHeight: 22,
    },
    tipRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        backgroundColor: theme.colors.warning + '08',
        padding: theme.spacing.s,
        borderRadius: 10,
    },
    tipText: {
        flex: 1,
        fontSize: theme.typography.sizes.xs,
        color: theme.colors.text.secondary,
        lineHeight: 18,
    },
    // Strengths & Improvements
    strengthsRow: {
        paddingHorizontal: theme.spacing.l,
        gap: theme.spacing.s,
    },
    strengthCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 16,
        padding: theme.spacing.m,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.6)',
        borderLeftWidth: 3,
        ...theme.shadows.medium,
    },
    strengthHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    strengthTitle: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '700',
    },
    strengthItem: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
        lineHeight: 22,
        paddingLeft: 4,
    },
    // Mistake cards
    mistakeCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.s,
        borderRadius: 16,
        padding: theme.spacing.m,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.6)',
        ...theme.shadows.medium,
    },
    mistakeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.s,
    },
    mistakeTypeRow: {
        flexDirection: 'row',
        gap: theme.spacing.s,
        alignItems: 'center',
    },
    mistakeTypePill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: theme.colors.primary + '12',
    },
    mistakeTypeText: {
        fontSize: 11,
        fontWeight: '600',
        color: theme.colors.primary,
    },
    severityBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: theme.borderRadius.circle,
    },
    severityText: {
        fontSize: 11,
        fontWeight: '600',
    },
    mistakeContent: {
        gap: 6,
    },
    mistakeLine: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    mistakeDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginTop: 7,
    },
    originalText: {
        flex: 1,
        fontSize: theme.typography.sizes.s,
        color: theme.colors.error,
        textDecorationLine: 'line-through',
        lineHeight: 20,
    },
    correctedText: {
        flex: 1,
        fontSize: theme.typography.sizes.s,
        color: theme.colors.success,
        fontWeight: '500',
        lineHeight: 20,
    },
    explanationContainer: {
        flexDirection: 'row',
        gap: 8,
        marginTop: theme.spacing.m,
        paddingTop: theme.spacing.s,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        alignItems: 'flex-start',
    },
    explanationText: {
        flex: 1,
        fontSize: theme.typography.sizes.xs,
        color: theme.colors.text.secondary,
        lineHeight: 18,
    },
    // AI Summary
    summaryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    aiIcon: {
        width: 28,
        height: 28,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    aiLabel: {
        fontSize: theme.typography.sizes.s,
        fontWeight: '700',
        color: theme.colors.text.primary,
    },
    summaryText: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
        lineHeight: 22,
    },
    // Actions
    actions: {
        paddingHorizontal: theme.spacing.l,
        marginTop: theme.spacing.l,
        gap: theme.spacing.m,
    },
    primaryAction: {
        borderRadius: theme.borderRadius.l,
        overflow: 'hidden',
        ...theme.shadows.primaryGlow,
    },
    actionGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.m,
        gap: theme.spacing.s,
    },
    primaryActionText: {
        color: 'white',
        fontSize: theme.typography.sizes.m,
        fontWeight: 'bold',
    },
    secondaryAction: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.m,
        borderRadius: theme.borderRadius.l,
        borderWidth: 1.5,
        borderColor: theme.colors.primary,
        gap: theme.spacing.s,
    },
    secondaryActionText: {
        color: theme.colors.primary,
        fontSize: theme.typography.sizes.m,
        fontWeight: '600',
    },
    detailToggle: {
        alignSelf: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    detailToggleText: {
        color: theme.colors.primary,
        fontSize: theme.typography.sizes.s,
        fontWeight: '600',
    },
});
