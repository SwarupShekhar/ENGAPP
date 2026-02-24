import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
    scores: {
        grammar: number;
        vocabulary: number;
        fluency: number;
        pronunciation: number;
    };
}

function SkillBar({ label, score, color }: { label: string; score: number; color: string }) {
    return (
        <View style={styles.skillRow}>
            <View style={styles.skillInfo}>
                <Text style={styles.skillLabel}>{label}</Text>
                <Text style={styles.skillScore}>{score}</Text>
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
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Skill Proficiency</Text>
            <SkillBar label="Grammar" score={scores.grammar} color="#8b5cf6" />
            <SkillBar label="Vocabulary" score={scores.vocabulary} color="#10b981" />
            <SkillBar label="Fluency" score={scores.fluency} color="#f59e0b" />
            <SkillBar label="Pronunciation" score={scores.pronunciation} color="#3b82f6" />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 10,
        elevation: 2,
    },
    title: {
        color: '#0F172A',
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
        color: '#64748B',
        fontSize: 14,
        fontWeight: '600',
    },
    skillScore: {
        color: '#0F172A',
        fontSize: 16,
        fontWeight: '800',
    },
    barBg: {
        height: 10,
        backgroundColor: '#F1F5F9',
        borderRadius: 6,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: 6,
    },
});
