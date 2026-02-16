import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { WordScore } from '../../types/assessment';

interface WordLevelBreakdownProps {
    wordScores: WordScore[];
}

export const WordLevelBreakdown: React.FC<WordLevelBreakdownProps> = ({ wordScores }) => {
    const getColorForScore = (score: number) => {
        if (score >= 85) return '#10b981'; // green
        if (score >= 70) return '#f59e0b'; // amber
        return '#ef4444'; // red
    };

    const getIconForScore = (score: number) => {
        if (score >= 85) return '✓';
        if (score >= 70) return '○';
        return '✗';
    };

    return (
        <BlurView intensity={20} tint="dark" style={styles.container}>
            <LinearGradient
                colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']}
                style={styles.gradient}
            >
                <Text style={styles.title}>Word-by-Word Analysis</Text>
                <Text style={styles.subtitle}>
                    See exactly which words need practice
                </Text>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.wordsScroll}
                >
                    {wordScores.map((wordData, index) => (
                        <View
                            key={`${wordData.word}-${index}`}
                            style={[
                                styles.wordCard,
                                { borderColor: getColorForScore(wordData.accuracy) }
                            ]}
                        >
                            <Text style={styles.wordIcon}>
                                {getIconForScore(wordData.accuracy)}
                            </Text>
                            <Text style={styles.word}>{wordData.word}</Text>
                            <Text
                                style={[
                                    styles.score,
                                    { color: getColorForScore(wordData.accuracy) }
                                ]}
                            >
                                {Math.round(wordData.accuracy)}
                            </Text>
                            {wordData.error_type !== 'None' && (
                                <Text style={styles.errorType}>
                                    {wordData.error_type}
                                </Text>
                            )}
                        </View>
                    ))}
                </ScrollView>

                <View style={styles.legend}>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
                        <Text style={styles.legendText}>Excellent (85+)</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
                        <Text style={styles.legendText}>Good (70-84)</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
                        <Text style={styles.legendText}>Needs Work (&lt;70)</Text>
                    </View>
                </View>
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
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 16,
    },
    wordsScroll: {
        marginVertical: 12,
    },
    wordCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 12,
        marginRight: 12,
        minWidth: 80,
        alignItems: 'center',
        borderWidth: 2,
    },
    wordIcon: {
        fontSize: 24,
        marginBottom: 4,
        color: 'white',
    },
    word: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 4,
    },
    score: {
        fontSize: 20,
        fontWeight: '700',
    },
    errorType: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 4,
        textAlign: 'center',
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    legendText: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
    },
});
