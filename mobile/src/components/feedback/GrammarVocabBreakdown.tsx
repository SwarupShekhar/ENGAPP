import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { GrammarAnalysis, VocabularyAnalysis } from '../../types/assessment';

interface GrammarVocabBreakdownProps {
    grammar: GrammarAnalysis;
    vocabulary: VocabularyAnalysis;
}

export const GrammarVocabBreakdown: React.FC<GrammarVocabBreakdownProps> = ({
    grammar,
    vocabulary,
}) => {
    const [expandedSection, setExpandedSection] = useState<'grammar' | 'vocab' | null>('grammar');

    return (
        <BlurView intensity={20} tint="dark" style={styles.container}>
            <LinearGradient
                colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']}
                style={styles.gradient}
            >
                <Text style={styles.mainTitle}>📚 Language Analysis</Text>

                {/* Grammar Section */}
                <TouchableOpacity
                    style={styles.sectionHeader}
                    onPress={() => setExpandedSection(expandedSection === 'grammar' ? null : 'grammar')}
                >
                    <View style={styles.headerLeft}>
                        <Text style={styles.sectionIcon}>📝</Text>
                        <View>
                            <Text style={styles.sectionTitle}>Grammar</Text>
                            <Text style={styles.cefr}>CEFR: {grammar.cefr_level}</Text>
                        </View>
                    </View>
                    <View style={styles.scoreCircle}>
                        <Text style={styles.scoreNumber}>{grammar.score}</Text>
                    </View>
                </TouchableOpacity>

                {expandedSection === 'grammar' && (
                    <View style={styles.expandedContent}>
                        {/* Grammar Errors */}
                        {grammar.errors.length > 0 && (
                            <View style={styles.subsection}>
                                <Text style={styles.subsectionTitle}>Errors Found ({grammar.errors.length})</Text>
                                {grammar.errors.map((error, index) => (
                                    <View
                                        key={index}
                                        style={[
                                            styles.errorCard,
                                            error.severity === 'major' ? styles.majorError : styles.minorError,
                                        ]}
                                    >
                                        <View style={styles.errorHeader}>
                                            <Text style={styles.errorType}>{error.error_type}</Text>
                                            <Text
                                                style={[
                                                    styles.severity,
                                                    error.severity === 'major' ? styles.majorText : styles.minorText,
                                                ]}
                                            >
                                                {error.severity}
                                            </Text>
                                        </View>
                                        <Text style={styles.errorText}>
                                            ❌ <Text style={styles.strikethrough}>{error.text}</Text>
                                        </Text>
                                        <Text style={styles.correctionText}>
                                            ✓ {error.correction}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Grammar Strengths */}
                        {grammar.strengths.length > 0 && (
                            <View style={styles.subsection}>
                                <Text style={styles.subsectionTitle}>Strengths</Text>
                                {grammar.strengths.map((strength, index) => (
                                    <View key={index} style={styles.strengthItem}>
                                        <Text style={styles.strengthBullet}>✓</Text>
                                        <Text style={styles.strengthText}>{strength}</Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Justification */}
                        <View style={styles.justificationBox}>
                            <Text style={styles.justificationLabel}>Why this score?</Text>
                            <Text style={styles.justificationText}>{grammar.justification}</Text>
                        </View>
                    </View>
                )}

                {/* Vocabulary Section */}
                <TouchableOpacity
                    style={[styles.sectionHeader, { marginTop: 12 }]}
                    onPress={() => setExpandedSection(expandedSection === 'vocab' ? null : 'vocab')}
                >
                    <View style={styles.headerLeft}>
                        <Text style={styles.sectionIcon}>📖</Text>
                        <View>
                            <Text style={styles.sectionTitle}>Vocabulary</Text>
                            <Text style={styles.cefr}>CEFR: {vocabulary.cefr_level}</Text>
                        </View>
                    </View>
                    <View style={styles.scoreCircle}>
                        <Text style={styles.scoreNumber}>{vocabulary.score}</Text>
                    </View>
                </TouchableOpacity>

                {expandedSection === 'vocab' && (
                    <View style={styles.expandedContent}>
                        {/* Stats */}
                        <View style={styles.statsGrid}>
                            <View style={styles.statCard}>
                                <Text style={styles.statNumber}>{vocabulary.word_count}</Text>
                                <Text style={styles.statLabel}>Total Words</Text>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={styles.statNumber}>{vocabulary.unique_words}</Text>
                                <Text style={styles.statLabel}>Unique Words</Text>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={styles.statNumber}>
                                    {vocabulary.word_count > 0 ? Math.round((vocabulary.unique_words / vocabulary.word_count) * 100) : 0}%
                                </Text>
                                <Text style={styles.statLabel}>Variety</Text>
                            </View>
                        </View>

                        {/* Advanced Words */}
                        {vocabulary.advanced_words.length > 0 && (
                            <View style={styles.subsection}>
                                <Text style={styles.subsectionTitle}>
                                    Advanced Words Used 🌟
                                </Text>
                                <View style={styles.tagsContainer}>
                                    {vocabulary.advanced_words.map((word, index) => (
                                        <View key={index} style={styles.advancedWordTag}>
                                            <Text style={styles.advancedWordText}>{word}</Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}

                        {/* Repetitions */}
                        {Object.keys(vocabulary.repetitions).length > 0 && (
                            <View style={styles.subsection}>
                                <Text style={styles.subsectionTitle}>
                                    Repeated Words ⚠️
                                </Text>
                                {Object.entries(vocabulary.repetitions).map(([word, count], index) => (
                                    <View key={index} style={styles.repetitionItem}>
                                        <Text style={styles.repetitionWord}>"{word}"</Text>
                                        <Text style={styles.repetitionCount}>
                                            used {count} times
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}

                        {/* Justification */}
                        <View style={styles.justificationBox}>
                            <Text style={styles.justificationLabel}>Why this score?</Text>
                            <Text style={styles.justificationText}>{vocabulary.justification}</Text>
                        </View>
                    </View>
                )}
            </LinearGradient>
        </BlurView>
    );
};

const styles = StyleSheet.create({
    container: {
        borderRadius: 20,
        overflow: 'hidden',
        marginVertical: 16,
    },
    gradient: {
        padding: 20,
    },
    mainTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 16,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 16,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    sectionIcon: {
        fontSize: 28,
        marginRight: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
    },
    cefr: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 2,
    },
    scoreCircle: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(139, 92, 246, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#8b5cf6',
    },
    scoreNumber: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    expandedContent: {
        marginTop: 12,
        paddingLeft: 8,
    },
    subsection: {
        marginBottom: 16,
    },
    subsectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.8)',
        marginBottom: 8,
    },
    errorCard: {
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
        borderLeftWidth: 3,
    },
    majorError: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderLeftColor: '#ef4444',
    },
    minorError: {
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderLeftColor: '#f59e0b',
    },
    errorHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    errorType: {
        fontSize: 12,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
        textTransform: 'capitalize',
    },
    severity: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    majorText: {
        color: '#ef4444',
    },
    minorText: {
        color: '#f59e0b',
    },
    errorText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
        marginBottom: 4,
    },
    strikethrough: {
        textDecorationLine: 'line-through',
        color: 'rgba(255,255,255,0.6)',
    },
    correctionText: {
        fontSize: 14,
        color: '#10b981',
    },
    strengthItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 6,
    },
    strengthBullet: {
        fontSize: 16,
        color: '#10b981',
        marginRight: 8,
    },
    strengthText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
        flex: 1,
    },
    justificationBox: {
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderRadius: 10,
        padding: 12,
        marginTop: 8,
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.3)',
    },
    justificationLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#c4b5fd',
        marginBottom: 4,
    },
    justificationText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.9)',
        lineHeight: 18,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    statCard: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 10,
        padding: 12,
        marginHorizontal: 4,
        alignItems: 'center',
    },
    statNumber: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fff',
    },
    statLabel: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 2,
    },
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    advancedWordTag: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.4)',
    },
    advancedWordText: {
        fontSize: 13,
        color: '#6ee7b7',
        fontWeight: '500',
    },
    repetitionItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
        padding: 8,
        marginBottom: 4,
    },
    repetitionWord: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '500',
    },
    repetitionCount: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
    },
});
