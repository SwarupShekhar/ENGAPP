import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme/theme';

interface PremiumStreakCardProps {
    streak: number;
}

export function PremiumStreakCard({ streak }: PremiumStreakCardProps) {
    return (
        <LinearGradient
            colors={theme.colors.gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
        >
            <View style={styles.content}>
                <View>
                    <View style={styles.streakBadge}>
                        <Ionicons name="flame" size={20} color={theme.colors.warning} />
                        <Text style={styles.streakCount}>{streak}</Text>
                    </View>
                    <Text style={styles.title}>Day Streak</Text>
                    <Text style={styles.subtitle}>Keep the momentum going!</Text>
                </View>
                <View style={styles.iconContainer}>
                    <Ionicons name="flame-outline" size={64} color="rgba(255,255,255,0.2)" />
                </View>
            </View>

            {/* Progress Dots */}
            <View style={styles.progressContainer}>
                {[...Array(7)].map((_, i) => (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                            i < (streak % 7) || (streak > 0 && i === 0) ? styles.dotActive : styles.dotInactive
                        ]}
                    />
                ))}
            </View>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    card: {
        marginHorizontal: theme.spacing.l,
        marginBottom: theme.spacing.l,
        borderRadius: theme.borderRadius.xl,
        padding: theme.spacing.l,
        ...theme.shadows.primaryGlow,
    },
    content: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.l,
    },
    streakBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.2)', // Glass effect
        borderRadius: theme.borderRadius.circle,
        paddingHorizontal: 12,
        paddingVertical: 6,
        alignSelf: 'flex-start',
        marginBottom: theme.spacing.s,
    },
    streakCount: {
        color: 'white',
        fontSize: theme.typography.sizes.l,
        fontWeight: 'bold',
    },
    title: {
        color: 'white',
        fontSize: theme.typography.sizes.xl, // Larger
        fontWeight: 'bold',
        marginBottom: 4,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: theme.typography.sizes.s,
    },
    iconContainer: {
        justifyContent: 'center',
    },
    progressContainer: {
        flexDirection: 'row',
        gap: 6,
    },
    dot: {
        height: 6,
        borderRadius: 3,
        flex: 1,
    },
    dotActive: {
        backgroundColor: 'white',
    },
    dotInactive: {
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
});
