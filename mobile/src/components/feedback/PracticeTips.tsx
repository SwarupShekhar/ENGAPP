import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { ActionableFeedback } from '../../types/assessment';

interface PracticeTipsProps {
    actionableFeedback: ActionableFeedback;
}

export const PracticeTips: React.FC<PracticeTipsProps> = ({ actionableFeedback }) => {
    return (
        <BlurView intensity={20} tint="dark" style={styles.container}>
            <LinearGradient
                colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']}
                style={styles.gradient}
            >
                <Text style={styles.mainTitle}>🎯 Your Practice Plan</Text>

                {/* Practice Words */}
                {actionableFeedback.practice_words.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Words to Practice</Text>
                        <View style={styles.wordsContainer}>
                            {actionableFeedback.practice_words.map((word, index) => (
                                <View key={index} style={styles.practiceWordChip}>
                                    <Text style={styles.practiceWord}>{word}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Phoneme Tips */}
                {actionableFeedback.phoneme_tips.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Sound Techniques</Text>
                        {actionableFeedback.phoneme_tips.map((tip, index) => (
                            <View key={index} style={styles.tipCard}>
                                <Text style={styles.tipText}>{tip}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Accent-Specific Tips */}
                {actionableFeedback.accent_specific_tips.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Accent-Specific Tips</Text>
                        {actionableFeedback.accent_specific_tips.map((tip, index) => (
                            <View key={index} style={styles.accentTipCard}>
                                <Text style={styles.accentTipIcon}>💡</Text>
                                <Text style={styles.tipText}>{tip}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Strengths */}
                {actionableFeedback.strengths.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>✨ What You're Doing Well</Text>
                        {actionableFeedback.strengths.map((strength, index) => (
                            <View key={index} style={styles.strengthCard}>
                                <Text style={styles.checkmark}>✓</Text>
                                <Text style={styles.strengthText}>{strength}</Text>
                            </View>
                        ))}
                    </View>
                )}

                <TouchableOpacity style={styles.practiceButton}>
                    <LinearGradient
                        colors={['#8b5cf6', '#7c3aed']}
                        style={styles.buttonGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    >
                        <Text style={styles.buttonText}>Start Practice Session</Text>
                    </LinearGradient>
                </TouchableOpacity>
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
        marginBottom: 20,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 12,
    },
    wordsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    practiceWordChip: {
        backgroundColor: 'rgba(139, 92, 246, 0.3)',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.5)',
    },
    practiceWord: {
        fontSize: 14,
        fontWeight: '600',
        color: '#c4b5fd',
    },
    tipCard: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#f59e0b',
    },
    tipText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
        lineHeight: 20,
    },
    accentTipCard: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'flex-start',
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.3)',
    },
    accentTipIcon: {
        fontSize: 20,
        marginRight: 8,
    },
    strengthCard: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'flex-start',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    checkmark: {
        fontSize: 18,
        color: '#10b981',
        marginRight: 8,
    },
    strengthText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
        flex: 1,
    },
    practiceButton: {
        marginTop: 12,
        borderRadius: 12,
        overflow: 'hidden',
    },
    buttonGradient: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
});
