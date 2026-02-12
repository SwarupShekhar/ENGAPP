import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { theme } from '../theme/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Mock Data ─────────────────────────────────────────────
const MOCK_FEEDBACK = {
    overallScore: 78,
    cefrLevel: 'B1',
    scores: {
        grammar: 72,
        pronunciation: 85,
        fluency: 68,
        vocabulary: 80,
    },
    mistakes: [
        {
            id: '1',
            type: 'verb_form',
            severity: 'high',
            original: 'I goed to Goa last month.',
            corrected: 'I went to Goa last month.',
            explanation: 'The past tense of "go" is "went", not "goed". This is an irregular verb.',
            rule: 'Irregular past tense',
        },
        {
            id: '2',
            type: 'verb_form',
            severity: 'high',
            original: 'I eated fish curry.',
            corrected: 'I ate fish curry.',
            explanation: 'The past tense of "eat" is "ate", not "eated". This is an irregular verb.',
            rule: 'Irregular past tense',
        },
        {
            id: '3',
            type: 'word_choice',
            severity: 'medium',
            original: 'The water was very beautiful and clean.',
            corrected: 'The water was crystal clear and beautiful.',
            explanation: 'Using more descriptive vocabulary like "crystal clear" sounds more natural and vivid.',
            rule: 'Vocabulary enrichment',
        },
    ],
    pronunciationIssues: [
        { id: '1', word: 'restaurants', expected: '/ˈres.tə.rɒnts/', actual: '/res.tau.rants/', severity: 'medium', suggestion: 'Stress the first syllable: RES-tuh-ronts' },
        { id: '2', word: 'beautiful', expected: '/ˈbjuː.tɪ.fəl/', actual: '/byu.ti.ful/', severity: 'low', suggestion: 'The middle syllable is reduced: BYOO-tih-ful' },
        { id: '3', word: 'delicious', expected: '/dɪˈlɪʃ.əs/', actual: '/de.li.si.ous/', severity: 'medium', suggestion: 'Stress second syllable: deh-LISH-us' },
    ],
    aiSummary: "Great effort in today's conversation! You showed confidence in expressing your ideas about travel and food. Your main area for improvement is irregular past tenses — you used regular patterns for irregular verbs like 'go' and 'eat'. Your pronunciation is generally clear but work on reducing syllables in longer words. Your fluency improved as the conversation went on, and your vocabulary is growing. Focus on irregular verbs this week for the biggest improvement!",
};

// ─── Skill Bar Component ──────────────────────────────────
function SkillBar({ label, score, icon, color, delay }: {
    label: string; score: number; icon: string; color: string; delay: number;
}) {
    return (
        <Animated.View entering={FadeInRight.delay(delay).springify()} style={styles.skillRow}>
            <View style={styles.skillInfo}>
                <View style={[styles.skillIcon, { backgroundColor: color + '15' }]}>
                    <Ionicons name={icon as any} size={16} color={color} />
                </View>
                <Text style={styles.skillLabel}>{label}</Text>
            </View>
            <View style={styles.barContainer}>
                <View style={[styles.barFill, { width: `${score}%`, backgroundColor: color }]} />
            </View>
            <Text style={[styles.skillScore, { color }]}>{score}%</Text>
        </Animated.View>
    );
}

// ─── Severity Badge ───────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
    const colors: Record<string, { bg: string; text: string }> = {
        high: { bg: theme.colors.error + '15', text: theme.colors.error },
        medium: { bg: theme.colors.warning + '15', text: theme.colors.warning },
        low: { bg: theme.colors.success + '15', text: theme.colors.success },
    };
    const c = colors[severity] || colors.medium;
    return (
        <View style={[styles.severityBadge, { backgroundColor: c.bg }]}>
            <Text style={[styles.severityText, { color: c.text }]}>
                {severity.charAt(0).toUpperCase() + severity.slice(1)}
            </Text>
        </View>
    );
}

// ─── Mistake Card ─────────────────────────────────────────
function MistakeCard({ item, index }: { item: typeof MOCK_FEEDBACK.mistakes[0]; index: number }) {
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

// ─── Pronunciation Card ───────────────────────────────────
function PronunciationCard({ item }: { item: typeof MOCK_FEEDBACK.pronunciationIssues[0] }) {
    return (
        <View style={styles.pronCard}>
            <Text style={styles.pronWord}>{item.word}</Text>
            <View style={styles.pronPhonetics}>
                <Text style={styles.pronExpected}>{item.expected}</Text>
            </View>
            <Text style={styles.pronSuggestion}>{item.suggestion}</Text>
            <TouchableOpacity style={styles.pronPlayButton}>
                <Ionicons name="play" size={14} color={theme.colors.primary} />
            </TouchableOpacity>
        </View>
    );
}

// ─── Main Component ───────────────────────────────────────
export default function CallFeedbackScreen({ navigation, route }: any) {
    const params = route?.params || {};
    const partnerName = params.partnerName || 'Sarah M.';
    const topic = params.topic || 'Travel';
    const callDuration = params.duration || 0;

    const data = MOCK_FEEDBACK;

    const formatDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    };

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

                {/* Skill Breakdown */}
                <Animated.View entering={FadeInDown.delay(300).springify()}>
                    <Text style={styles.sectionTitle}>Skill Breakdown</Text>
                    <View style={styles.skillsCard}>
                        <SkillBar label="Grammar" score={data.scores.grammar} icon="text" color="#6366F1" delay={400} />
                        <SkillBar label="Pronunciation" score={data.scores.pronunciation} icon="mic" color="#10B981" delay={500} />
                        <SkillBar label="Fluency" score={data.scores.fluency} icon="water" color="#F59E0B" delay={600} />
                        <SkillBar label="Vocabulary" score={data.scores.vocabulary} icon="book" color="#8B5CF6" delay={700} />
                    </View>
                </Animated.View>

                {/* Key Mistakes */}
                <Text style={styles.sectionTitle}>Key Mistakes</Text>
                {data.mistakes.map((item, index) => (
                    <MistakeCard key={item.id} item={item} index={index} />
                ))}

                {/* Pronunciation Issues */}
                <Animated.View entering={FadeInDown.delay(900).springify()}>
                    <Text style={styles.sectionTitle}>Pronunciation Issues</Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.pronList}
                    >
                        {data.pronunciationIssues.map((item) => (
                            <PronunciationCard key={item.id} item={item} />
                        ))}
                    </ScrollView>
                </Animated.View>

                {/* AI Summary */}
                <Animated.View entering={FadeInDown.delay(1000).springify()}>
                    <Text style={styles.sectionTitle}>AI Summary</Text>
                    <View style={styles.summaryCard}>
                        <View style={styles.summaryHeader}>
                            <LinearGradient
                                colors={theme.colors.gradients.primary}
                                style={styles.aiIcon}
                            >
                                <Ionicons name="sparkles" size={14} color="white" />
                            </LinearGradient>
                            <Text style={styles.aiLabel}>EngR AI Analysis</Text>
                        </View>
                        <Text style={styles.summaryText}>{data.aiSummary}</Text>
                    </View>
                </Animated.View>

                {/* Action Buttons */}
                <Animated.View entering={FadeInDown.delay(1100).springify()} style={styles.actions}>
                    <TouchableOpacity style={styles.primaryAction} activeOpacity={0.8}>
                        <LinearGradient
                            colors={theme.colors.gradients.primary}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.actionGradient}
                        >
                            <Ionicons name="fitness" size={20} color="white" />
                            <Text style={styles.primaryActionText}>Practice Mistakes</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.7}>
                        <Ionicons name="share-outline" size={20} color={theme.colors.primary} />
                        <Text style={styles.secondaryActionText}>Share Results</Text>
                    </TouchableOpacity>
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

    // Meta
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
        backgroundColor: theme.colors.surface,
        ...theme.shadows.small,
    },
    metaText: {
        fontSize: theme.typography.sizes.xs,
        color: theme.colors.text.secondary,
        fontWeight: '500',
    },

    // Score Card
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

    // Section
    sectionTitle: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        paddingHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.m,
        marginTop: theme.spacing.m,
    },

    // Skills
    skillsCard: {
        backgroundColor: theme.colors.surface,
        marginHorizontal: theme.spacing.l,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.m,
        gap: theme.spacing.m,
        ...theme.shadows.small,
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

    // Mistakes
    mistakeCard: {
        backgroundColor: theme.colors.surface,
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.s,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.m,
        ...theme.shadows.small,
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

    // Pronunciation
    pronList: {
        paddingHorizontal: theme.spacing.l,
        gap: theme.spacing.s,
    },
    pronCard: {
        width: 160,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.m,
        ...theme.shadows.small,
    },
    pronWord: {
        fontSize: theme.typography.sizes.m,
        fontWeight: '700',
        color: theme.colors.text.primary,
        marginBottom: 4,
    },
    pronPhonetics: {
        marginBottom: theme.spacing.s,
    },
    pronExpected: {
        fontSize: theme.typography.sizes.xs,
        color: theme.colors.primary,
        fontStyle: 'italic',
    },
    pronSuggestion: {
        fontSize: 11,
        color: theme.colors.text.secondary,
        lineHeight: 16,
    },
    pronPlayButton: {
        position: 'absolute',
        top: theme.spacing.s,
        right: theme.spacing.s,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: theme.colors.primary + '15',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // AI Summary
    summaryCard: {
        backgroundColor: theme.colors.surface,
        marginHorizontal: theme.spacing.l,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.m,
        ...theme.shadows.small,
    },
    summaryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: theme.spacing.m,
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
});
