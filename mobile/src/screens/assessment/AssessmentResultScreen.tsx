import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { theme } from '../../theme/theme';
import { useUser } from '@clerk/clerk-expo';

export default function AssessmentResultScreen({ navigation, route }: any) {
    const { result } = route.params || {};
    const { user } = useUser();

    const handleContinueToHome = async () => {
        try {
            // Mark assessment as completed in Clerk metadata
            if (user) {
                await user.update({
                    unsafeMetadata: {
                        ...(user.unsafeMetadata || {}),
                        assessmentCompleted: true,
                    },
                });
            }
        } catch (err) {
            console.error('Failed to update assessment status:', err);
        }

        // Navigate to Home regardless
        navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
        });
    };

    // Fallback if result is missing (testing)
    const overallLevel = result?.overallLevel || "B1";
    const overallScore = result?.overallScore || 65;
    const plan = result?.personalizedPlan || {
        weeklyGoal: "Improve Fluency",
        dailyFocus: ["Speaking", "Listening"],
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Assessment Complete!</Text>
                </View>

                <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.scoreCard}>
                    <LinearGradient
                        colors={theme.colors.gradients.primary}
                        style={styles.scoreGradient}
                    >
                        <Text style={styles.levelLabel}>Your Level</Text>
                        <Text style={styles.levelText}>{overallLevel}</Text>
                        <View style={styles.scoreBadge}>
                            <Text style={styles.scoreText}>{Math.round(overallScore)}/100</Text>
                        </View>
                    </LinearGradient>
                </Animated.View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Your Personalized Plan</Text>
                    <View style={styles.planCard}>
                        <View style={styles.planRow}>
                            <Ionicons name="flag" size={24} color={theme.colors.primary} />
                            <View style={styles.planTextContainer}>
                                <Text style={styles.planLabel}>Weekly Goal</Text>
                                <Text style={styles.planValue}>{plan.weeklyGoal}</Text>
                            </View>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.planRow}>
                            <Ionicons name="calendar" size={24} color={theme.colors.primary} />
                            <View style={styles.planTextContainer}>
                                <Text style={styles.planLabel}>Daily Focus</Text>
                                <Text style={styles.planValue}>{plan.dailyFocus.join(", ")}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <TouchableOpacity
                    style={styles.button}
                    onPress={handleContinueToHome}
                >
                    <Text style={styles.buttonText}>Continue to Home</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        padding: theme.spacing.l,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: theme.typography.sizes.xl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
    },
    scoreCard: {
        margin: theme.spacing.l,
        height: 200,
        borderRadius: theme.borderRadius.xl,
        ...theme.shadows.medium,
    },
    scoreGradient: {
        flex: 1,
        borderRadius: theme.borderRadius.xl,
        justifyContent: 'center',
        alignItems: 'center',
    },
    levelLabel: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: theme.typography.sizes.l,
        marginBottom: theme.spacing.s,
    },
    levelText: {
        color: theme.colors.surface,
        fontSize: 64,
        fontWeight: 'bold',
        marginBottom: theme.spacing.m,
    },
    scoreBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.borderRadius.circle,
    },
    scoreText: {
        color: theme.colors.surface,
        fontWeight: '600',
    },
    section: {
        padding: theme.spacing.l,
    },
    sectionTitle: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.m,
    },
    planCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.l,
        padding: theme.spacing.m,
        ...theme.shadows.small,
    },
    planRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: theme.spacing.s,
    },
    planTextContainer: {
        marginLeft: theme.spacing.m,
    },
    planLabel: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
    },
    planValue: {
        fontSize: theme.typography.sizes.m,
        fontWeight: '600',
        color: theme.colors.text.primary,
    },
    divider: {
        height: 1,
        backgroundColor: theme.colors.border,
        marginVertical: theme.spacing.s,
    },
    button: {
        margin: theme.spacing.l,
        backgroundColor: theme.colors.primary,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.l,
        alignItems: 'center',
        ...theme.shadows.primaryGlow,
    },
    buttonText: {
        color: theme.colors.surface,
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
    },
});
