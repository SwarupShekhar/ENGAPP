import { useUser } from '@clerk/clerk-expo';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../theme/theme';
import { ConnectPracticeCard } from '../components/home/ConnectPracticeCard';
import { FeedbackReadyCard } from '../components/home/FeedbackReadyCard';
import { WeekProgressRow } from '../components/home/WeekProgressRow';
import { userApi, UserStats } from '../api/user';

export default function HomeScreen() {
    const { user, isLoaded } = useUser();
    const navigation: any = useNavigation();

    const [stats, setStats] = useState<UserStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isLoaded && user && !user.firstName) {
            navigation.replace('CreateProfile');
        }
    }, [isLoaded, user]);

    useFocusEffect(
        useCallback(() => {
            if (!user) return;
            const fetchStats = async () => {
                try {
                    const data = await userApi.getStats();
                    setStats(data);
                } catch (error) {
                    console.error('Failed to fetch user stats:', error);
                } finally {
                    setLoading(false);
                }
            };
            fetchStats();
        }, [user])
    );

    const displayData = {
        name: user?.firstName || "User",
        mistakesLines: stats?.mistakeCount || 34,
        words: stats?.vocabScore ? Math.round(stats.vocabScore * 10) : 28, // Mock word count
        level: stats?.level || 'B2',
    };

    if (!isLoaded) return null;

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="white" />
            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerLeft}>
                            <View style={styles.avatarPlaceholder}>
                                <Image source={{ uri: user?.imageUrl }} style={styles.avatarImage} />
                                {/* Fallback if no image */}
                                {(!user?.imageUrl) && <Text style={styles.avatarText}>{displayData.name.charAt(0)}</Text>}
                            </View>
                            <Text style={styles.greeting}>Hi {displayData.name} 👋</Text>
                        </View>
                        <TouchableOpacity style={styles.iconBtn}>
                            <Ionicons name="notifications-outline" size={24} color="#7C3AED" />
                        </TouchableOpacity>
                    </View>

                    {/* Connect & Practice Card */}
                    <Animated.View entering={FadeInDown.delay(100).springify()}>
                        <ConnectPracticeCard onPress={() => navigation.navigate('CallPreference')} />
                    </Animated.View>

                    {/* Feedback Ready Card */}
                    <Animated.View entering={FadeInDown.delay(200).springify()}>
                        <FeedbackReadyCard onPress={() => navigation.navigate('Feedback')} />
                    </Animated.View>

                    {/* Weekly Progress */}
                    <Animated.View entering={FadeInDown.delay(300).springify()}>
                        <Text style={styles.sectionTitle}>This Week's Progress</Text>
                        <WeekProgressRow
                            mistakes={displayData.mistakesLines}
                            words={displayData.words}
                            level={displayData.level}
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
        backgroundColor: 'white', // Changed to white as per mock
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
        paddingVertical: theme.spacing.m,
        marginBottom: theme.spacing.s,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatarPlaceholder: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    avatarText: {
        color: '#64748B',
        fontWeight: 'bold',
        fontSize: 18,
    },
    greeting: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
    },
    iconBtn: {
        padding: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginLeft: theme.spacing.l,
        marginBottom: theme.spacing.m,
        marginTop: theme.spacing.s,
    },
    footerSpacer: {
        height: 120, // Increased to clear the floating tab bar and button
    },
});
