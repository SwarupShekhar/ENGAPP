import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';

interface FeedbackReadyCardProps {
    onPress: () => void;
    timeAgo?: string;
    overallScore?: number;
    grammarDelta?: number;
    fluencyDelta?: number;
    vocabDelta?: number;
    pronunciationDelta?: number;
}

function DeltaChip({ label, delta }: { label: string; delta?: number }) {
    if (delta === undefined || delta === 0) return null;
    const isUp = delta > 0;
    return (
        <View style={[styles.chip, { backgroundColor: isUp ? '#D1FAE5' : '#FEE2E2' }]}>
            <Text style={[styles.chipText, { color: isUp ? '#065F46' : '#991B1B' }]}>
                {isUp ? '↑' : '↓'} {label}
            </Text>
        </View>
    );
}

export function FeedbackReadyCard({
    onPress,
    timeAgo = '2 min ago',
    overallScore,
    grammarDelta,
    fluencyDelta,
    vocabDelta,
    pronunciationDelta,
}: FeedbackReadyCardProps) {
    const hasScore = overallScore !== undefined && overallScore > 0;
    const hasDelta = grammarDelta || fluencyDelta || vocabDelta || pronunciationDelta;

    return (
        <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <View style={styles.iconBg}>
                        <Ionicons name="sparkles" size={14} color="white" />
                    </View>
                    <Text style={styles.title}>Latest Feedback</Text>
                </View>
                <Text style={styles.time}>{timeAgo}</Text>
            </View>

            {hasScore ? (
                <View style={styles.scoreRow}>
                    <View style={styles.scoreCircle}>
                        <Text style={styles.scoreValue}>{overallScore}</Text>
                    </View>
                    <View style={styles.scoreDetails}>
                        <Text style={styles.scoreLabel}>Overall Score</Text>
                        <Text style={styles.scoreHint}>
                            {overallScore >= 80 ? 'Excellent work! 🎉' : overallScore >= 60 ? 'Good progress! 💪' : 'Keep practicing! 🚀'}
                        </Text>
                    </View>
                </View>
            ) : (
                <Text style={styles.description}>
                    Complete a call to see your feedback here!
                </Text>
            )}

            {hasDelta && (
                <View style={styles.chipsRow}>
                    <DeltaChip label="Grammar" delta={grammarDelta} />
                    <DeltaChip label="Fluency" delta={fluencyDelta} />
                    <DeltaChip label="Vocab" delta={vocabDelta} />
                    <DeltaChip label="Pronun." delta={pronunciationDelta} />
                </View>
            )}

            <View style={styles.footer}>
                <Text style={styles.detailsText}>View Details</Text>
                <Ionicons name="chevron-forward" size={16} color="#6366F1" />
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 20,
        padding: theme.spacing.l,
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.l,
        ...theme.shadows.medium,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.6)',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    iconBg: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#6366F1',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 15,
        fontWeight: '700',
        color: theme.colors.text.primary,
    },
    time: {
        fontSize: 12,
        color: theme.colors.text.light,
    },
    scoreRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    scoreCircle: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#EEF2FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    scoreValue: {
        fontSize: 20,
        fontWeight: '800',
        color: '#4F46E5',
    },
    scoreDetails: {
        flex: 1,
    },
    scoreLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.text.primary,
    },
    scoreHint: {
        fontSize: 13,
        color: theme.colors.text.secondary,
        marginTop: 2,
    },
    description: {
        fontSize: 14,
        color: theme.colors.text.secondary,
        marginBottom: 12,
        lineHeight: 20,
    },
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 12,
    },
    chip: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    chipText: {
        fontSize: 12,
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
    },
    detailsText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6366F1',
    },
});
