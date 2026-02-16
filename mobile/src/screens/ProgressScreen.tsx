import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../theme/theme';
import { sessionsApi, ConversationSession } from '../api/sessions';
import { userApi, UserStats } from '../api/user';
import { SkillRadarChart } from '../components/progress/SkillRadarChart';
import { PerformanceTrendChart } from '../components/progress/PerformanceTrendChart';
import { JourneyTimeline } from '../components/progress/JourneyTimeline';
import { useUser } from '@clerk/clerk-expo';

export default function ProgressScreen() {
    const { user } = useUser();
    const [stats, setStats] = useState<UserStats | null>(null);
    const [sessions, setSessions] = useState<ConversationSession[]>([]);
    const [loading, setLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            const fetchData = async () => {
                try {
                    const [statsData, sessionsData] = await Promise.all([
                        userApi.getStats(),
                        sessionsApi.listSessions()
                    ]);
                    setStats(statsData);
                    setSessions(sessionsData);
                } catch (error) {
                    console.error('Failed to fetch progress data:', error);
                } finally {
                    setLoading(false);
                }
            };
            fetchData();
        }, [])
    );

    // --- Calculations ---

    // 1. Averages for Radar Chart (Last 5 valid sessions)
    const validSessions = sessions.filter(s => s.analyses && s.analyses.length > 0 && s.analyses[0].scores);
    const recentsessions = validSessions.slice(0, 5); // Take last 5

    const averages = recentsessions.reduce((acc, s) => {
        const scores = s.analyses![0].scores;
        return {
            grammar: acc.grammar + (scores.grammar || 0),
            vocabulary: acc.vocabulary + (scores.vocabulary || 0),
            fluency: acc.fluency + (scores.fluency || 0),
            pronunciation: acc.pronunciation + (scores.pronunciation || 0),
            overall: acc.overall + (scores.overall || 0),
        };
    }, { grammar: 0, vocabulary: 0, fluency: 0, pronunciation: 0, overall: 0 });

    const count = recentsessions.length || 1;
    const radarData = {
        grammar: Math.round(averages.grammar / count),
        vocabulary: Math.round(averages.vocabulary / count),
        fluency: Math.round(averages.fluency / count),
        pronunciation: Math.round(averages.pronunciation / count),
    };

    // 2. Trend Data (Chronological order for line chart)
    const trendData = validSessions
        .slice(0, 10) // Last 10
        .reverse()    // Oldest to newest
        .map(s => s.analyses![0].scores.overall);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Background Gradient Mesh */}
            <View style={StyleSheet.absoluteFill}>
                <LinearGradient
                    colors={['#E0F2FE', '#F3E8FF', '#F0F9FF']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />
            </View>

            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.header}>
                        <View>
                            <Text style={styles.headerTitle}>Progress Dashboard</Text>
                            <Text style={styles.headerSubtitle}>
                                {stats?.level ? `Level ${stats.level} Scholar` : 'Beginner Scholar'}
                            </Text>
                        </View>
                        <View style={styles.levelBadge}>
                            <Ionicons name="shield-checkmark" size={16} color="white" />
                            <Text style={styles.levelText}>{stats?.level || 'A1'}</Text>
                        </View>
                    </Animated.View>

                    {/* Skill Radar */}
                    <SkillRadarChart
                        grammar={radarData.grammar}
                        vocabulary={radarData.vocabulary}
                        fluency={radarData.fluency}
                        pronunciation={radarData.pronunciation}
                    />

                    {/* Performance Trend */}
                    <PerformanceTrendChart data={trendData} />

                    {/* Stat Grid (Small cards) */}
                    <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.gridRow}>
                        <View style={styles.smallCard}>
                            <BlurView intensity={40} tint="light" style={styles.blur} />
                            <Ionicons name="time-outline" size={20} color={theme.colors.primary} />
                            <Text style={styles.gridValue}>{stats?.totalSessions || 0}</Text>
                            <Text style={styles.gridLabel}>Sessions</Text>
                        </View>
                        <View style={styles.smallCard}>
                            <BlurView intensity={40} tint="light" style={styles.blur} />
                            <Ionicons name="flame-outline" size={20} color={theme.colors.warning} />
                            <Text style={styles.gridValue}>{stats?.streak || 0}</Text>
                            <Text style={styles.gridLabel}>Day Streak</Text>
                        </View>
                        <View style={styles.smallCard}>
                            <BlurView intensity={40} tint="light" style={styles.blur} />
                            <Ionicons name="chatbubbles-outline" size={20} color={theme.colors.success} />
                            <Text style={styles.gridValue}>
                                {sessions.length > 0
                                    ? Math.round(sessions.reduce((acc, s) => acc + (s.duration || 0), 0) / 60)
                                    : 0}m
                            </Text>
                            <Text style={styles.gridLabel}>Prac. Time</Text>
                        </View>
                    </Animated.View>

                    {/* Journey Timeline */}
                    <JourneyTimeline
                        currentLevel={stats?.level || 'A1'}
                        joinedDate={user?.createdAt?.toString() || new Date().toISOString()}
                        totalSessions={stats?.totalSessions || sessions.length}
                    />

                    <View style={styles.footerSpacer} />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F0F2F8',
    },
    safeArea: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: theme.spacing.xl,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.l,
        marginTop: theme.spacing.s,
    },
    headerTitle: {
        fontSize: theme.typography.sizes.xxl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
    },
    headerSubtitle: {
        fontSize: theme.typography.sizes.m,
        color: theme.colors.text.secondary,
        marginTop: 4,
    },
    levelBadge: {
        backgroundColor: theme.colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    levelText: {
        color: 'white',
        fontWeight: 'bold',
    },
    gridRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.m,
        marginBottom: theme.spacing.xl,
        gap: 12,
    },
    smallCard: {
        flex: 1,
        height: 100,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    blur: {
        ...StyleSheet.absoluteFillObject,
    },
    gridValue: {
        fontSize: 22,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginTop: 8,
    },
    gridLabel: {
        fontSize: 12,
        color: theme.colors.text.secondary,
        marginTop: 2,
    },
    footerSpacer: {
        height: 100,
    },
});
