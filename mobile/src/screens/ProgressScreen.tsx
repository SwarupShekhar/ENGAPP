import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';

import { theme } from '../theme/theme';
import { LevelProgressCard } from '../components/progress/LevelProgressCard';
import { DetailedStatsGrid } from '../components/progress/DetailedStatsGrid';
import { WeeklyActivityChart } from '../components/progress/WeeklyActivityChart';
import { StreaksAndGoals } from '../components/progress/StreaksAndGoals';

import { userApi, UserStats, AssessmentHistoryItem } from '../api/user';

export default function ProgressScreen() {
    const [stats, setStats] = useState<UserStats | null>(null);
    const [history, setHistory] = useState<AssessmentHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            const fetchData = async () => {
                try {
                    const [statsData, historyData] = await Promise.all([
                        userApi.getStats(),
                        userApi.getHistory()
                    ]);
                    setStats(statsData);
                    setHistory(historyData);
                } catch (error) {
                    console.error('Failed to fetch progress data:', error);
                } finally {
                    setLoading(false);
                }
            };
            fetchData();
        }, [])
    );

    // Process history for chart (Last 7 days or sessions)
    // Simply map the last 7 sessions reverse chronological to chronological for chart
    const chartData = history
        .slice(0, 7)
        .reverse()
        .map(h => ({
            day: new Date(h.date).toLocaleDateString(undefined, { weekday: 'short' }),
            score: h.overallScore
        }));

    // If no history, show empty placeholder or last 7 days empty
    if (chartData.length === 0) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const today = new Date().getDay();
        for (let i = 6; i >= 0; i--) {
            chartData.push({
                day: days[(today - i + 7) % 7],
                score: 0
            });
        }
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <LinearGradient
                colors={theme.colors.gradients.surface}
                style={styles.background}
            />
            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
                        <Text style={styles.title}>Your Progress</Text>
                        <Text style={styles.subtitle}>Track your comprehensive growth</Text>
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(200).springify()}>
                        <LevelProgressCard
                            currentLevel={stats?.level || 'A1'}
                            nextLevel={stats?.nextLevel || 'A2'}
                            progress={0.45} // Placeholder: Calculate real progress within level if desired
                            pointsToNext={550} // Placeholder
                        />
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(300).springify()}>
                        <DetailedStatsGrid
                            grammar={stats?.grammarScore || 0}
                            pronunciation={stats?.pronunciationScore || 0}
                            fluency={stats?.fluencyScore || 0}
                            vocabulary={stats?.vocabScore || 0}
                        />
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(400).springify()}>
                        <WeeklyActivityChart data={chartData} />
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(500).springify()}>
                        <StreaksAndGoals
                            currentStreak={stats?.streak || 0}
                            longestStreak={Math.max(stats?.streak || 0, 5)} // Placeholder for longest
                            sessionsCompleted={stats?.sessionsThisWeek || 0}
                            weeklyGoal={stats?.sessionGoal || 7}
                        />
                    </Animated.View>

                    <View style={styles.footerSpacer} />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    background: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: 300,
    },
    safeArea: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: theme.spacing.xl,
    },
    header: {
        paddingHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.m,
        marginTop: theme.spacing.m,
    },
    title: {
        fontSize: theme.typography.sizes.xxl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: 4,
    },
    subtitle: {
        fontSize: theme.typography.sizes.m,
        color: theme.colors.text.secondary,
    },
    footerSpacer: {
        height: 100,
    },
});
