import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme/theme';

interface LevelProgressCardProps {
    currentLevel: string;
    nextLevel: string;
    progress: number;
    pointsToNext: number;
}

export function LevelProgressCard({ currentLevel, nextLevel, progress, pointsToNext }: LevelProgressCardProps) {
    return (
        <View style={styles.card}>
            <LinearGradient
                colors={theme.colors.gradients.primary}
                style={styles.headerGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
            >
                <View style={styles.levelBadge}>
                    <Text style={styles.levelText}>{currentLevel}</Text>
                </View>
                <Text style={styles.levelLabel}>Current Level</Text>
            </LinearGradient>

            <View style={styles.content}>
                <View style={styles.progressRow}>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(0, progress * 100))}%` }]} />
                    </View>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.pointsText}>{pointsToNext} points to {nextLevel}</Text>
                    <Text style={styles.percentageText}>{Math.round(progress * 100)}%</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.l,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        ...theme.shadows.medium,
        overflow: 'hidden',
    },
    headerGradient: {
        padding: theme.spacing.m,
        flexDirection: 'row',
        alignItems: 'center',
    },
    levelBadge: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: theme.spacing.s,
    },
    levelText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: theme.typography.sizes.l,
    },
    levelLabel: {
        color: 'white',
        fontSize: theme.typography.sizes.m,
        fontWeight: '500',
    },
    content: {
        padding: theme.spacing.m,
    },
    progressRow: {
        height: 8,
        marginBottom: theme.spacing.s,
    },
    progressBarBg: {
        flex: 1,
        height: 8,
        borderRadius: 4,
        backgroundColor: theme.colors.border,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: theme.colors.primary,
        borderRadius: 4,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    pointsText: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
    },
    percentageText: {
        fontSize: theme.typography.sizes.m,
        fontWeight: 'bold',
        color: theme.colors.primary,
    },
});
