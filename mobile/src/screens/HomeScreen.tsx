import { useUser } from '@clerk/clerk-expo';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { theme } from '../theme/theme';
import { StatsOverview } from '../components/home/StatsOverview';
import { StickyPrompt } from '../components/home/StickyPrompt';
import { HomeCarousel } from '../components/home/HomeCarousel';

export default function HomeScreen() {
    const { user, isLoaded } = useUser();
    const navigation: any = useNavigation();

    useEffect(() => {
        if (isLoaded && user && !user.firstName) {
            navigation.replace('CreateProfile');
        }
    }, [isLoaded, user]);

    // Mock data for now, but use real name if available
    const userData = {
        name: user?.firstName || "User",
        feedbackScore: 85,
        fluencyScore: 78,
        vocabScore: 92,
        recentMistakes: 3,
    };

    if (!isLoaded) return null; // Or a loading spinner

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
                    <Animated.View
                        entering={FadeInDown.delay(100).springify()}
                        style={styles.header}
                    >
                        <View>
                            <Text style={styles.greeting}>Hello,</Text>
                            <Text style={styles.username}>{userData.name}</Text>
                        </View>
                        <View style={styles.avatarPlaceholder} />
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(200).springify()}>
                        <StatsOverview
                            feedbackScore={userData.feedbackScore}
                            fluencyScore={userData.fluencyScore}
                            vocabScore={userData.vocabScore}
                        />
                    </Animated.View>

                    <StickyPrompt
                        mistakeCount={userData.recentMistakes}
                        onPress={() => navigation.navigate('AssessmentIntro')}
                    />

                    <Animated.View entering={FadeInDown.delay(400).springify()}>
                        <Text style={styles.sectionTitle}>Your Activity</Text>
                        <HomeCarousel />
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.m,
        paddingTop: theme.spacing.m,
        marginBottom: theme.spacing.s,
    },
    greeting: {
        fontSize: theme.typography.sizes.l,
        color: theme.colors.text.secondary,
    },
    username: {
        fontSize: theme.typography.sizes.xxl,
        fontWeight: theme.typography.weights.black as any,
        color: theme.colors.text.primary,
    },
    avatarPlaceholder: {
        width: 48,
        height: 48,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: theme.colors.primaryLight,
        opacity: 0.2,
    },
    sectionTitle: {
        fontSize: theme.typography.sizes.l,
        fontWeight: theme.typography.weights.bold as any,
        color: theme.colors.text.primary,
        marginLeft: theme.spacing.m,
        marginBottom: theme.spacing.s,
    },
    footerSpacer: {
        height: 100,
    },
});
