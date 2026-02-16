import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface WeeklyActivityBarProps {
    /** Array of 7 numbers representing calls per day (Mon–Sun) */
    activity: number[];
    /** Current day index (0 = Monday, 6 = Sunday) */
    todayIndex?: number;
}

export function WeeklyActivityBar({ activity, todayIndex }: WeeklyActivityBarProps) {
    const maxVal = Math.max(...activity, 1);
    const today = todayIndex ?? new Date().getDay(); // JS: 0=Sun → remap
    const todayMon = today === 0 ? 6 : today - 1; // Remap to Mon=0

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.sectionTitle}>This Week</Text>
                <Text style={styles.totalCalls}>
                    {activity.reduce((a, b) => a + b, 0)} calls
                </Text>
            </View>
            <View style={styles.barsRow}>
                {activity.map((val, i) => {
                    const heightPercent = Math.max((val / maxVal) * 100, 8);
                    const isToday = i === todayMon;
                    return (
                        <View key={i} style={styles.barColumn}>
                            <View style={styles.barWrapper}>
                                <View
                                    style={[
                                        styles.bar,
                                        {
                                            height: `${heightPercent}%`,
                                            backgroundColor: isToday ? '#6366F1' : val > 0 ? '#A5B4FC' : '#E2E8F0',
                                            borderRadius: 6,
                                        },
                                    ]}
                                />
                            </View>
                            <Text style={[styles.dayLabel, isToday && styles.dayLabelActive]}>
                                {DAYS[i]}
                            </Text>
                        </View>
                    );
                })}
            </View>
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
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.6)',
        ...theme.shadows.medium,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.m,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: theme.colors.text.primary,
    },
    totalCalls: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text.secondary,
    },
    barsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        height: 80,
    },
    barColumn: {
        flex: 1,
        alignItems: 'center',
    },
    barWrapper: {
        width: 20,
        height: '100%',
        justifyContent: 'flex-end',
    },
    bar: {
        width: '100%',
    },
    dayLabel: {
        marginTop: 6,
        fontSize: 11,
        fontWeight: '600',
        color: theme.colors.text.light,
    },
    dayLabelActive: {
        color: '#6366F1',
        fontWeight: '800',
    },
});
