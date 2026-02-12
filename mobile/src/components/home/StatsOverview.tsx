import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GradientCard } from '../common/GradientCard';
import { theme } from '../../theme/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface StatsOverviewProps {
    feedbackScore: number;
    fluencyScore: number;
    vocabScore: number;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({
    feedbackScore,
    fluencyScore,
    vocabScore,
}) => {
    return (
        <View style={styles.container}>
            <Text style={styles.header}>Your Progress</Text>
            <View style={styles.row}>
                <GradientCard style={styles.mainCard} colors={theme.colors.gradients.primary}>
                    <View style={styles.iconContainer}>
                        <MaterialCommunityIcons name="trophy-outline" size={24} color={theme.colors.surface} />
                    </View>
                    <Text style={styles.scoreLarge}>{feedbackScore}</Text>
                    <Text style={styles.labelLight}>Overall Score</Text>
                </GradientCard>

                <View style={styles.rightColumn}>
                    <GradientCard style={styles.smallCard}>
                        <Text style={styles.scoreSmall}>{fluencyScore}%</Text>
                        <Text style={styles.labelDark}>Fluency</Text>
                    </GradientCard>
                    <GradientCard style={styles.smallCard}>
                        <Text style={styles.scoreSmall}>{vocabScore}</Text>
                        <Text style={styles.labelDark}>Vocab</Text>
                    </GradientCard>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: theme.spacing.m,
    },
    header: {
        fontSize: theme.typography.sizes.l,
        fontWeight: theme.typography.weights.bold as any,
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.s,
        paddingHorizontal: theme.spacing.m,
    },
    row: {
        flexDirection: 'row',
        paddingHorizontal: theme.spacing.m,
        gap: theme.spacing.m,
    },
    mainCard: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 120,
        ...theme.shadows.primaryGlow,
    },
    rightColumn: {
        flex: 1,
        gap: theme.spacing.m,
    },
    smallCard: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.s,
    },
    iconContainer: {
        marginBottom: theme.spacing.xs,
        opacity: 0.9,
    },
    scoreLarge: {
        fontSize: theme.typography.sizes.xxl,
        fontWeight: theme.typography.weights.black as any,
        color: theme.colors.surface,
    },
    labelLight: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.surface,
        opacity: 0.8,
    },
    scoreSmall: {
        fontSize: theme.typography.sizes.l,
        fontWeight: theme.typography.weights.bold as any,
        color: theme.colors.primary,
    },
    labelDark: {
        fontSize: theme.typography.sizes.s,
        color: theme.colors.text.secondary,
    },
});
