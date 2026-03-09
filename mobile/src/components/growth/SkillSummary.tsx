import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';
import { getSkillColor, SKILL_NAMES } from '../../theme/colorUtils';

interface Props {
    scores: {
        grammar: number;
        vocabulary: number;
        fluency: number;
        pronunciation: number;
    };
}

function SkillBar({ label, score, color }: { label: string; score: number; color: string }) {
    const theme = useAppTheme();
    const styles = getStyles(theme);
    return (
        <View style={styles.skillRow}>
            <View style={styles.skillInfo}>
                <Text style={styles.skillLabel}>{label}</Text>
                <Text style={[styles.skillScore, { color }]}>{score}</Text>
            </View>
            <View style={styles.barBg}>
                <View 
                    style={[
                        styles.barFill, 
                        { width: `${Math.max(5, score)}%`, backgroundColor: color }
                    ]} 
                />
            </View>
        </View>
    );
}

export default function SkillSummary({ scores }: Props) {
    const theme = useAppTheme();
    const styles = getStyles(theme);
    
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Skill Proficiency</Text>
            <SkillBar label={SKILL_NAMES.grammar} score={scores.grammar} color={getSkillColor(theme, 'grammar')} />
            <SkillBar label={SKILL_NAMES.vocabulary} score={scores.vocabulary} color={getSkillColor(theme, 'vocabulary')} />
            <SkillBar label={SKILL_NAMES.fluency} score={scores.fluency} color={getSkillColor(theme, 'fluency')} />
            <SkillBar label={SKILL_NAMES.pronunciation} score={scores.pronunciation} color={getSkillColor(theme, 'pronunciation')} />
        </View>
    );
}

const getStyles = (theme: any) => StyleSheet.create({
    container: {
        backgroundColor: theme.colors.surface,
        borderRadius: 24,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: theme.colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 10,
        elevation: 2,
    },
    title: {
        color: theme.colors.text.primary,
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 20,
    },
    skillRow: {
        marginBottom: 16,
    },
    skillInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
        alignItems: 'baseline',
    },
    skillLabel: {
        color: theme.colors.text.secondary,
        fontSize: 14,
        fontWeight: '600',
    },
    skillScore: {
        color: theme.colors.text.primary,
        fontSize: 16,
        fontWeight: '800',
    },
    barBg: {
        height: 10,
        backgroundColor: theme.colors.border + '20',
        borderRadius: 6,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: 6,
    },
});
