import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface StreaksAndGoalsProps {
    currentStreak: number;
    longestStreak: number;
    sessionsCompleted: number;
    weeklyGoal: number;
}

export function StreaksAndGoals({ currentStreak, longestStreak, sessionsCompleted, weeklyGoal }: StreaksAndGoalsProps) {
    const goalProgress = Math.min(1, sessionsCompleted / Math.max(1, weeklyGoal));

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <View style={styles.streakContainer}>
                    <View style={styles.fireIconBg}>
                        <Ionicons name="flame" size={24} color={theme.colors.error} />
                    </View>
                    <View>
                        <Text style={styles.streakValue}>{currentStreak} Days</Text>
                        <Text style={styles.streakLabel}>Current Streak</Text>
                    </View>
                </View>
            </View>

            <View style={styles.card}>
                <View style={styles.goalContainer}>
                    <View style={styles.goalTextParams}>
                        <Text style={styles.goalValue}>{sessionsCompleted}/{weeklyGoal}</Text>
                        <Text style={styles.goalLabel}>Weekly Sessions</Text>
                    </View>
                    <View style={styles.goalProgressBg}>
                        <View style={[styles.goalProgressFill, { width: `${goalProgress * 100}%` }]} />
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.xl,
        flexDirection: 'row',
        gap: theme.spacing.m,
    },
    card: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        padding: theme.spacing.m,
        ...theme.shadows.small,
    },
    streakContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.s,
    },
    fireIconBg: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.colors.error + '15',
        justifyContent: 'center',
        alignItems: 'center',
    },
    streakValue: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
    },
    streakLabel: {
        fontSize: 10,
        color: theme.colors.text.secondary,
    },
    goalContainer: {
        justifyContent: 'center',
    },
    goalTextParams: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 8,
    },
    goalValue: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.primary,
    },
    goalLabel: {
        fontSize: 10,
        color: theme.colors.text.secondary,
    },
    goalProgressBg: {
        height: 6,
        backgroundColor: theme.colors.border,
        borderRadius: 3,
        overflow: 'hidden',
    },
    goalProgressFill: {
        height: '100%',
        backgroundColor: theme.colors.primary,
        borderRadius: 3,
    },
});
