import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../theme/theme';

interface ScoreBreakdownCardProps {
    scores: {
        pronunciation: number;
        grammar: number;
        vocabulary: number;
        fluency: number;
    };
    justifications?: {
        pronunciation?: string;
        grammar?: string;
        vocabulary?: string;
        fluency?: string;
    };
}

export const ScoreBreakdownCard: React.FC<ScoreBreakdownCardProps> = ({ scores, justifications }) => {
    const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

    const metrics = [
        {
            key: 'pronunciation',
            label: 'Pronunciation',
            score: scores.pronunciation,
            justification: justifications?.pronunciation || 'Based on phoneme accuracy and clarity',
            color: '#10B981',
        },
        {
            key: 'grammar',
            label: 'Grammar',
            score: scores.grammar,
            justification: justifications?.grammar || 'Based on structural accuracy and complexity',
            color: '#6366F1',
        },
        {
            key: 'vocabulary',
            label: 'Vocabulary',
            score: scores.vocabulary,
            justification: justifications?.vocabulary || 'Based on word variety and appropriateness',
            color: '#8B5CF6',
        },
        {
            key: 'fluency',
            label: 'Fluency',
            score: scores.fluency,
            justification: justifications?.fluency || 'Based on pacing and natural flow',
            color: '#F59E0B',
        },
    ];

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Score Breakdown</Text>

            {metrics.map((metric) => (
                <View key={metric.key}>
                    <TouchableOpacity
                        style={styles.metricRow}
                        onPress={() => setExpandedMetric(
                            expandedMetric === metric.key ? null : metric.key
                        )}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.metricLabel}>{metric.label}</Text>
                        <View style={styles.scoreContainer}>
                            <Text style={[styles.score, { color: metric.color }]}>{metric.score}/100</Text>
                            <Text style={styles.expandIcon}>
                                {expandedMetric === metric.key ? '▼' : '▶'}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    {/* Progress bar */}
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(0, metric.score))}%`, backgroundColor: metric.color }]} />
                    </View>

                    {expandedMetric === metric.key && (
                        <View style={styles.justificationContainer}>
                            <Text style={styles.justificationLabel}>Why this score?</Text>
                            <Text style={styles.justificationText}>{metric.justification}</Text>
                        </View>
                    )}
                </View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 16,
        padding: theme.spacing.m,
        marginBottom: theme.spacing.l,
        marginHorizontal: theme.spacing.l,
        ...theme.shadows.medium,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.6)',
    },
    title: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.m,
    },
    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    metricLabel: {
        fontSize: theme.typography.sizes.m,
        fontWeight: '500',
        color: theme.colors.text.primary,
    },
    scoreContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    score: {
        fontSize: theme.typography.sizes.m,
        fontWeight: '700',
    },
    expandIcon: {
        fontSize: 12,
        color: theme.colors.text.secondary,
    },
    progressBarBg: {
        height: 6,
        backgroundColor: theme.colors.border,
        borderRadius: 3,
        marginBottom: 8,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    justificationContainer: {
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        padding: 10,
        borderRadius: 8,
        marginBottom: 12,
    },
    justificationLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#6366F1',
        marginBottom: 2,
    },
    justificationText: {
        fontSize: 12,
        color: theme.colors.text.secondary,
        lineHeight: 18,
    },
});
