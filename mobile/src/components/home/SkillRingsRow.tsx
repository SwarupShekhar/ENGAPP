import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme/theme';

interface SkillBarProps {
    label: string;
    score: number;
    icon: keyof typeof Ionicons.glyphMap;
    gradientColors: readonly [string, string, ...string[]];
    bgColor: string;
}

function SkillBar({ label, score, icon, gradientColors, bgColor }: SkillBarProps) {
    const clampedScore = Math.min(Math.max(score, 0), 100);

    return (
        <View style={styles.skillItem}>
            <View style={styles.skillHeader}>
                <View style={[styles.skillIcon, { backgroundColor: bgColor }]}>
                    <Ionicons name={icon} size={14} color={gradientColors[0]} />
                </View>
                <Text style={styles.skillLabel}>{label}</Text>
                <Text style={[styles.skillScore, { color: gradientColors[0] }]}>{clampedScore}</Text>
            </View>
            <View style={styles.barTrack}>
                <LinearGradient
                    colors={gradientColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.barFill, { width: `${Math.max(clampedScore, 3)}%` }]}
                />
            </View>
        </View>
    );
}

interface SkillRingsRowProps {
    grammar: number;
    pronunciation: number;
    fluency: number;
    vocabulary: number;
}

export function SkillRingsRow({ grammar, pronunciation, fluency, vocabulary }: SkillRingsRowProps) {
    const avgScore = Math.round((grammar + pronunciation + fluency + vocabulary) / 4);

    return (
        <View style={styles.container}>
            {/* Header row */}
            <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>Your Skills</Text>
                <View style={styles.avgBadge}>
                    <Text style={styles.avgText}>Avg: {avgScore}</Text>
                </View>
            </View>

            {/* Skill bars */}
            <SkillBar
                label="Grammar"
                score={grammar}
                icon="text"
                gradientColors={['#6366F1', '#818CF8']}
                bgColor="#EEF2FF"
            />
            <SkillBar
                label="Pronunciation"
                score={pronunciation}
                icon="mic"
                gradientColors={['#F59E0B', '#FBBF24']}
                bgColor="#FFFBEB"
            />
            <SkillBar
                label="Fluency"
                score={fluency}
                icon="water"
                gradientColors={['#10B981', '#34D399']}
                bgColor="#ECFDF5"
            />
            <SkillBar
                label="Vocabulary"
                score={vocabulary}
                icon="book"
                gradientColors={['#3B82F6', '#60A5FA']}
                bgColor="#EFF6FF"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.l,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 20,
        padding: theme.spacing.l,
        // Glassmorphism effect
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.6)',
        ...theme.shadows.medium,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: theme.colors.text.primary,
    },
    avgBadge: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    avgText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#6366F1',
    },
    skillItem: {
        marginBottom: 14,
    },
    skillHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    skillIcon: {
        width: 24,
        height: 24,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    skillLabel: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text.primary,
    },
    skillScore: {
        fontSize: 15,
        fontWeight: '800',
    },
    barTrack: {
        height: 8,
        backgroundColor: '#F1F5F9',
        borderRadius: 4,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: 4,
    },
});
