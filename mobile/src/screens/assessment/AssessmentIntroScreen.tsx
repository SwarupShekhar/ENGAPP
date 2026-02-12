import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { theme } from '../../theme/theme';

export default function AssessmentIntroScreen({ navigation }: any) {
    return (
        <SafeAreaView style={styles.container}>
            <LinearGradient
                colors={theme.colors.gradients.surface}
                style={styles.background}
            />

            <View style={styles.content}>
                <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.iconContainer}>
                    <LinearGradient
                        colors={theme.colors.gradients.primary}
                        style={styles.iconGradient}
                    >
                        <Ionicons name="mic" size={48} color={theme.colors.surface} />
                    </LinearGradient>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(200).springify()}>
                    <Text style={styles.title}>English Level Assessment</Text>
                    <Text style={styles.subtitle}>
                        Take a quick 3-minute test to personalize your learning plan.
                    </Text>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.stepsContainer}>
                    <StepItem
                        icon="book-outline"
                        title="Read Aloud"
                        description="Read a simple sentence."
                        delay={400}
                    />
                    <StepItem
                        icon="mic-outline"
                        title="Adaptive Speaking"
                        description="Repeat sentences as they get harder."
                        delay={500}
                    />
                    <StepItem
                        icon="image-outline"
                        title="Describe Image"
                        description="Tell us what you see."
                        delay={600}
                    />
                    <StepItem
                        icon="chatbubbles-outline"
                        title="Open Response"
                        description="Answer a simple question."
                        delay={700}
                    />
                </Animated.View>

                <View style={styles.spacer} />

                <Animated.View entering={FadeInDown.delay(800).springify()} style={styles.footer}>
                    <TouchableOpacity
                        style={styles.buttonContainer}
                        onPress={() => navigation.navigate('AssessmentSpeaking')}
                        activeOpacity={0.8}
                    >
                        <LinearGradient
                            colors={theme.colors.gradients.primary}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.gradientButton}
                        >
                            <Text style={styles.buttonText}>Start Assessment</Text>
                            <Ionicons name="arrow-forward" size={20} color={theme.colors.surface} />
                        </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.skipButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={styles.skipText}>Skip for now</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </SafeAreaView>
    );
}

function StepItem({ icon, title, description, delay }: any) {
    return (
        <Animated.View entering={FadeInDown.delay(delay).springify()} style={styles.stepItem}>
            <View style={styles.stepIcon}>
                <Ionicons name={icon} size={24} color={theme.colors.primary} />
            </View>
            <View>
                <Text style={styles.stepTitle}>{title}</Text>
                <Text style={styles.stepDescription}>{description}</Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    background: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '40%',
    },
    content: {
        flex: 1,
        padding: theme.spacing.l,
        alignItems: 'center',
    },
    iconContainer: {
        marginTop: theme.spacing.xl,
        marginBottom: theme.spacing.l,
        ...theme.shadows.medium,
    },
    iconGradient: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: theme.typography.sizes.xxl,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        textAlign: 'center',
        marginBottom: theme.spacing.s,
    },
    subtitle: {
        fontSize: theme.typography.sizes.m,
        color: theme.colors.text.secondary,
        textAlign: 'center',
        marginBottom: theme.spacing.xl,
        paddingHorizontal: theme.spacing.m,
    },
    stepsContainer: {
        width: '100%',
        gap: theme.spacing.m,
    },
    stepItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.m,
        ...theme.shadows.small,
    },
    stepIcon: {
        width: 48,
        height: 48,
        borderRadius: theme.borderRadius.circle,
        backgroundColor: theme.colors.primaryLight + '20',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: theme.spacing.m,
    },
    stepTitle: {
        fontSize: theme.typography.sizes.m,
        fontWeight: '600',
        color: theme.colors.text.primary,
    },
    stepDescription: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
    },
    spacer: {
        flex: 1,
    },
    footer: {
        width: '100%',
        gap: theme.spacing.m,
        marginBottom: theme.spacing.m,
    },
    buttonContainer: {
        borderRadius: theme.borderRadius.l,
        overflow: 'hidden',
        ...theme.shadows.primaryGlow,
    },
    gradientButton: {
        paddingVertical: theme.spacing.m,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.s,
    },
    buttonText: {
        color: theme.colors.surface,
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
    },
    skipButton: {
        paddingVertical: theme.spacing.s,
        alignItems: 'center',
    },
    skipText: {
        color: theme.colors.text.secondary,
        fontSize: theme.typography.sizes.m,
    },
});
