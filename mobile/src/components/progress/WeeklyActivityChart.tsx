import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

interface WeeklyActivityChartProps {
    data: { day: string; score: number }[];
}

export function WeeklyActivityChart({ data }: WeeklyActivityChartProps) {
    const maxScore = 100; // Assuming scores are 0-100

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Weekly Activity</Text>
            <View style={styles.chartContainer}>
                {data.map((item, index) => (
                    <View key={index} style={styles.barContainer}>
                        <View style={styles.barTrack}>
                            <View
                                style={[
                                    styles.barFill,
                                    {
                                        height: `${Math.min(100, item.score)}%`,
                                        backgroundColor: item.score > 0 ? theme.colors.primary : theme.colors.border
                                    }
                                ]}
                            />
                        </View>
                        <Text style={styles.dayLabel}>{item.day}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.l,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.m,
        ...theme.shadows.small,
    },
    title: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.m,
    },
    chartContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        height: 150,
        paddingTop: 10,
    },
    barContainer: {
        alignItems: 'center',
        flex: 1,
    },
    barTrack: {
        width: 8,
        height: '100%',
        backgroundColor: theme.colors.background,
        borderRadius: 4,
        overflow: 'hidden',
        justifyContent: 'flex-end',
    },
    barFill: {
        width: '100%',
        borderRadius: 4,
        minHeight: 4,
    },
    dayLabel: {
        marginTop: 8,
        fontSize: 10,
        color: theme.colors.text.secondary,
    },
});
