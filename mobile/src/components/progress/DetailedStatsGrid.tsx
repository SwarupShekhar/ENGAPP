import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';

interface DetailedStatsGridProps {
    grammar: number;
    pronunciation: number;
    fluency: number;
    vocabulary: number;
}

export function DetailedStatsGrid({ grammar, pronunciation, fluency, vocabulary }: DetailedStatsGridProps) {
    const renderStatItem = (label: string, value: number, icon: any, color: string) => (
        <View style={styles.statItem}>
            <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
                <Ionicons name={icon} size={20} color={color} />
            </View>
            <View style={styles.statContent}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
            </View>
            <View style={styles.statBarBg}>
                <View style={[styles.statBarFill, { width: `${value}%`, backgroundColor: color }]} />
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <Text style={styles.sectionTitle}>Skill Breakdown</Text>
            <View style={styles.grid}>
                {renderStatItem('Grammar', grammar, 'school-outline', theme.colors.primary)}
                {renderStatItem('Pronunciation', pronunciation, 'mic-outline', theme.colors.success)}
                {renderStatItem('Fluency', fluency, 'chatbubbles-outline', theme.colors.secondary)}
                {renderStatItem('Vocabulary', vocabulary, 'book-outline', theme.colors.warning)}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.l,
    },
    sectionTitle: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        marginBottom: theme.spacing.m,
        color: theme.colors.text.primary,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.m,
    },
    statItem: {
        width: '47%',
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        borderRadius: 16,
        padding: theme.spacing.m,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.6)',
        ...theme.shadows.medium,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: theme.spacing.s,
    },
    statContent: {
        marginBottom: theme.spacing.s,
    },
    statValue: {
        fontSize: theme.typography.sizes.xl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
    },
    statLabel: {
        fontSize: 10,
        color: theme.colors.text.secondary,
    },
    statBarBg: {
        height: 4,
        backgroundColor: theme.colors.border,
        borderRadius: 2,
    },
    statBarFill: {
        height: '100%',
        borderRadius: 2,
    },
});
