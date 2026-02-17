import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';

import { theme } from '../theme/theme';

interface PracticeModeCardProps {
    title: string;
    description: string;
    icon: any;
    color: string;
    onPress: () => void;
    index: number;
}

function PracticeModeCard({ title, description, icon, color, onPress, index }: PracticeModeCardProps) {
    return (
        <Animated.View entering={FadeInDown.delay(index * 100 + 200).springify()}>
            <TouchableOpacity
                style={styles.card}
                activeOpacity={0.8}
                onPress={onPress}
            >
                <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
                    <Ionicons name={icon} size={28} color={color} />
                </View>
                <View style={styles.cardContent}>
                    <Text style={styles.cardTitle}>{title}</Text>
                    <Text style={styles.cardDesc}>{description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.text.secondary} />
            </TouchableOpacity>
        </Animated.View>
    );
}

export default function PracticeScreen() {
    const navigation: any = useNavigation();

    const practiceModes = [
        {
            title: 'Speaking Prompt',
            description: 'Practice speaking on a random topic',
            icon: 'mic',
            color: theme.colors.primary,
            route: 'AssessmentIntro' // Reusing existing assessment flow for now
        },
        {
            title: 'Describe Image',
            description: 'Describe what you see in the image',
            icon: 'image',
            color: theme.colors.secondary,
            route: 'AssessmentIntro' // Placeholder
        },
        {
            title: 'Roleplay',
            description: 'Interactive scenario-based practice',
            icon: 'people',
            color: theme.colors.success,
            route: 'AssessmentIntro' // Placeholder
        },
        {
            title: 'Shadowing',
            description: 'Listen and repeat to improve accent',
            icon: 'repeat',
            color: theme.colors.warning,
            route: 'AssessmentIntro' // Placeholder
        }
    ];

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
                        <Text style={styles.title}>Practice Arena</Text>
                        <Text style={styles.subtitle}>Choose a mode to sharpen your skills</Text>
                    </Animated.View>

                    {/* AI Tutor Feature Card */}
                    <Animated.View entering={FadeInDown.delay(150).springify()}>
                        <TouchableOpacity
                            style={styles.aiTutorCard}
                            activeOpacity={0.85}
                            onPress={() => navigation.navigate('AITutor')}
                        >
                            <LinearGradient
                                colors={theme.colors.gradients.premium}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.aiTutorGradient}
                            >
                                <View style={styles.aiTutorLeft}>
                                    <View style={styles.aiTutorAvatarRing}>
                                        <Text style={styles.aiTutorAvatarText}>✨</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.aiTutorTitle}>Talk to Priya (AI)</Text>
                                        <Text style={styles.aiTutorDesc}>
                                            Practice English conversation with your AI tutor
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.aiTutorArrow}>
                                    <Ionicons name="arrow-forward" size={18} color="white" />
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>

                    <View style={styles.grid}>
                        {practiceModes.map((mode, index) => (
                            <PracticeModeCard
                                key={index}
                                index={index}
                                title={mode.title}
                                description={mode.description}
                                icon={mode.icon}
                                color={mode.color}
                                onPress={() => navigation.navigate(mode.route)}
                            />
                        ))}
                    </View>
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
        marginTop: theme.spacing.m,
        marginBottom: theme.spacing.xl,
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
    grid: {
        paddingHorizontal: theme.spacing.l,
        gap: theme.spacing.m,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.l,
        ...theme.shadows.small,
        marginBottom: theme.spacing.s,
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: theme.spacing.m,
    },
    cardContent: {
        flex: 1,
    },
    cardTitle: {
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
        color: theme.colors.text.primary,
        marginBottom: 4,
    },
    cardDesc: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
        lineHeight: 18,
    },

    // AI Tutor Card
    aiTutorCard: {
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.xl,
        borderRadius: theme.borderRadius.xl,
        overflow: 'hidden',
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    aiTutorGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: theme.spacing.l,
    },
    aiTutorLeft: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    aiTutorAvatarRing: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    aiTutorAvatarText: {
        fontSize: 22,
    },
    aiTutorTitle: {
        color: 'white',
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
    },
    aiTutorDesc: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: theme.typography.sizes.xs,
        marginTop: 2,
    },
    aiTutorArrow: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.18)',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
