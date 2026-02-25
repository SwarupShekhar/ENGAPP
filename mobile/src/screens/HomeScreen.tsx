import { useUser } from '@clerk/clerk-expo';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { theme } from '../theme/theme';
import { ConnectPracticeCard } from '../components/home/ConnectPracticeCard';
import { FeedbackReadyCard } from '../components/home/FeedbackReadyCard';
import { SkillRingsRow } from '../components/home/SkillRingsRow';
import { WeeklyActivityBar } from '../components/home/WeeklyActivityBar';
import { userApi, UserStats } from '../api/user';
import { chatApi } from '../api/connections';

export default function HomeScreen() {
    const { user, isLoaded } = useUser();
    const navigation: any = useNavigation();

    const [stats, setStats] = useState<UserStats | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isLoaded && user && !user.firstName) {
            navigation.replace('CreateProfile');
        }
    }, [isLoaded, user]);

    useFocusEffect(
        useCallback(() => {
            if (!user) return;
            const fetchData = async () => {
                try {
                    // 1. Instant load from local cache
                    const cachedStats = await AsyncStorage.getItem('@home_stats_cache');
                    const cachedUnread = await AsyncStorage.getItem('@home_unread_cache');
                    if (cachedStats) {
                        setStats(JSON.parse(cachedStats));
                        setLoading(false); // Remove activity indicator immediately
                    }
                    if (cachedUnread) {
                        setUnreadCount(JSON.parse(cachedUnread));
                    }

                    // 2. Fetch fresh data in the background
                    const [statsData, unreadData] = await Promise.all([
                        userApi.getStats(),
                        chatApi.getUnreadCount()
                    ]);
                    
                    // 3. Silently update UI & cache with fresh data
                    setStats(statsData);
                    const unread = unreadData.count || 0;
                    setUnreadCount(unread);
                    
                    AsyncStorage.setItem('@home_stats_cache', JSON.stringify(statsData));
                    AsyncStorage.setItem('@home_unread_cache', JSON.stringify(unread));
                } catch (error) {
                    console.error('Failed to fetch home data:', error);
                } finally {
                    setLoading(false);
                }
            };
            fetchData();
        }, [user])
    );

    const displayData = {
        name: user?.firstName || "User",
        grammar: Math.min(100, stats?.grammarScore ?? 0),
        pronunciation: Math.min(100, stats?.pronunciationScore ?? 0),
        fluency: Math.min(100, stats?.fluencyScore ?? 0),
        vocabulary: Math.min(100, stats?.vocabScore ?? 0),
        level: stats?.level || 'B1',
        streak: stats?.streak ?? 0,
        sessionsThisWeek: stats?.sessionsThisWeek ?? 0,
        overallScore: stats?.feedbackScore ? Math.min(100, Math.round(stats.feedbackScore)) : 0,
    };

    // Mock weekly activity data (will come from API later)
    const weeklyActivity = stats?.sessionsThisWeek
        ? [0, 1, 0, 2, 1, stats.sessionsThisWeek > 3 ? 2 : 1, 0]
        : [0, 0, 0, 0, 0, 0, 0];

    if (!isLoaded) return null;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#4F46E5" />

            {/* Gradient Header */}
            <LinearGradient
                colors={['#4F46E5', '#6366F1', '#818CF8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerGradient}
            >
                <SafeAreaView edges={['top']}>
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <View style={styles.avatarContainer}>
                                {user?.imageUrl ? (
                                    <Image source={{ uri: user.imageUrl }} style={styles.avatarImage} />
                                ) : (
                                    <Text style={styles.avatarText}>{displayData.name.charAt(0)}</Text>
                                )}
                            </View>
                            <View style={{ flexShrink: 1 }}>
                                <Text style={styles.greetingSmall}>Welcome back</Text>
                                <Text style={styles.greeting} numberOfLines={1}>{displayData.name} 👋</Text>
                            </View>
                        </View>
                        <View style={styles.headerRight}>
                            {displayData.streak > 0 && (
                                <View style={styles.streakBadge}>
                                    <Text style={styles.streakEmoji}>🔥</Text>
                                    <Text style={styles.streakText}>{displayData.streak}</Text>
                                </View>
                            )}
                            <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('Conversations')}>
                                <Ionicons name="chatbox-ellipses-outline" size={22} color="white" />
                                {unreadCount > 0 && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>
                                            {unreadCount > 9 ? '9+' : unreadCount}
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('Notifications')}>
                                <Ionicons name="notifications-outline" size={22} color="white" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Level badge in header */}
                    <View style={styles.levelRow}>
                        <View style={styles.levelBadge}>
                            <Ionicons name="shield-checkmark" size={14} color="#FCD34D" />
                            <Text style={styles.levelText}>Level {displayData.level}</Text>
                        </View>
                        <Text style={styles.levelHint}>
                            {displayData.sessionsThisWeek} sessions this week
                        </Text>
                    </View>
                </SafeAreaView>
            </LinearGradient>

            {/* Content */}
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                style={styles.scrollView}
            >
                {/* Connect & Practice Card */}
                <Animated.View entering={FadeInDown.delay(100).springify()}>
                    <ConnectPracticeCard onPress={() => navigation.navigate('CallPreference')} />
                </Animated.View>

                {/* Skill Rings */}
                <Animated.View entering={FadeInDown.delay(200).springify()}>
                    <SkillRingsRow
                        grammar={displayData.grammar}
                        pronunciation={displayData.pronunciation}
                        fluency={displayData.fluency}
                        vocabulary={displayData.vocabulary}
                    />
                </Animated.View>

                {/* Weekly Activity */}
                <Animated.View entering={FadeInDown.delay(300).springify()}>
                    <WeeklyActivityBar activity={weeklyActivity} />
                </Animated.View>

                {/* Feedback Card */}
                <Animated.View entering={FadeInDown.delay(400).springify()}>
                    <FeedbackReadyCard
                        onPress={() => navigation.navigate('Feedback')}
                        overallScore={displayData.overallScore}
                    />
                </Animated.View>

                <View style={styles.footerSpacer} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F0F2F8',
    },
    headerGradient: {
        paddingBottom: theme.spacing.l,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.l,
        paddingTop: theme.spacing.s,
        paddingBottom: theme.spacing.m,
        overflow: 'visible',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flexShrink: 1,
        marginRight: 8,
    },
    avatarContainer: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: 'rgba(255,255,255,0.25)',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.5)',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    avatarText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 18,
    },
    greetingSmall: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
        fontWeight: '500',
    },
    greeting: {
        fontSize: 20,
        fontWeight: '800',
        color: 'white',
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
    },
    streakBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        gap: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    streakEmoji: {
        fontSize: 14,
    },
    streakText: {
        color: 'white',
        fontSize: 13,
        fontWeight: '700',
    },
    notifBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        position: 'relative',
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#EF4444',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderWidth: 1.5,
        borderColor: '#4F46E5',
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
    levelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.l,
        marginTop: theme.spacing.s,
    },
    levelBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.18)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
    },
    levelText: {
        color: 'white',
        fontSize: 13,
        fontWeight: '700',
    },
    levelHint: {
        color: 'rgba(255,255,255,0.65)',
        fontSize: 12,
        fontWeight: '500',
    },
    scrollView: {
        flex: 1,
        marginTop: -12,
    },
    scrollContent: {
        paddingTop: theme.spacing.l,
        paddingBottom: theme.spacing.xl,
    },
    footerSpacer: {
        height: 100,
    },
});
